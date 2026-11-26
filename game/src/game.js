// Skyline Courier — the game itself.
// One job: own the state machine (title, flying, paused, crashed, over),
// the three missions, ring checks, landings, crashes, fuel, damage and score,
// and drive the renderer and HUD each frame. Also owns the ?shot= modes the
// screenshots are taken from, so every shot replays deterministically.

import { CONFIG, clamp } from './config.js';
import { World } from './world.js';
import { Plane } from './plane.js';
import { Renderer } from './render.js';
import { drawHUD, drawTitle, drawOverlay } from './hud.js';
import { Sound } from './audio.js';
import { Input } from './input.js';

export const MISSIONS = [
  { id: 1, name: 'MISSION 1 — RING RUN', objective: 'Fly through all 8 gold rings' },
  { id: 2, name: 'MISSION 2 — ISLAND HOP', objective: 'Rings, then land on the runway to refuel' },
  { id: 3, name: 'MISSION 3 — STORM COURIER', objective: '10 rings in a crosswind — hold your line' },
];

export class Game {
  constructor(canvas, seed) {
    this.canvas = canvas;
    this.seed = seed;
    this.world = new World(seed);
    this.plane = new Plane();
    this.renderer = new Renderer(canvas);
    this.sound = new Sound();
    this.input = new Input(canvas);
    this.state = 'title'; // title | flying | paused | crashed | over
    this.score = 0;
    this.best = 0;
    try {
      this.best = Number(window.localStorage.getItem('skyline-courier-best') || 0) || 0;
    } catch {
      this.best = 0;
    }
    this.lives = CONFIG.lives;
    this.missionIndex = 0;
    this.rings = this.world.buildCourse(1);
    this.ringsPassed = 0;
    this.message = '';
    this.messageT = 0;
    this.time = 0;
    this.crashTimer = 0;
    this.crashReason = '';
    this.landedBonusGiven = false;
    this.shotMode = null;

    this.input.onStart = () => {
      this.sound.ensure();
      if (this.state === 'title') this.startFlight();
      else if (this.state === 'over') this.restartAll();
    };
    this.input.onRestart = () => {
      if (this.state !== 'title') this.restartAll();
    };
    this.input.onPause = () => {
      if (this.state === 'flying') this.state = 'paused';
      else if (this.state === 'paused') this.state = 'flying';
    };
    this.input.onMute = () => {
      this.sound.ensure();
      this.sound.setMuted(!this.sound.muted);
    };
  }

  get mission() {
    return MISSIONS[this.missionIndex];
  }

  startFlight() {
    this.state = 'flying';
    this.plane.throttle = 0.55;
    this.setMessage('THROTTLE UP — FLY THE RINGS');
  }

  restartAll() {
    this.score = 0;
    this.lives = CONFIG.lives;
    this.missionIndex = 0;
    this.rings = this.world.buildCourse(1);
    this.ringsPassed = 0;
    this.plane.reset();
    this.state = 'title';
    this.startFlight();
  }

  setMessage(text, seconds = 2.5) {
    this.message = text;
    this.messageT = seconds;
  }

  // One fixed step of simulation.
  update(dt) {
    this.time += dt;
    if (this.messageT > 0) this.messageT -= dt;
    if (this.state === 'crashed') {
      this.crashTimer -= dt;
      if (this.crashTimer <= 0) {
        if (this.lives <= 0) {
          this.state = 'over';
          this.saveBest();
        } else {
          this.respawn();
        }
      }
      return;
    }
    if (this.state !== 'flying') return;

    this.input.update();
    const wind = this.world.windAt(this.time, this.mission.id);
    this.plane.update(this.input, wind, dt, this.world);
    this.sound.setEngine(this.plane.throttle, this.plane.speed, !this.plane.onGround);

    // Ring checks: fly within the ring's radius of its centre.
    for (const ring of this.rings) {
      if (ring.passed) continue;
      const dx = this.plane.x - ring.x;
      const dy = this.plane.y - ring.y;
      const dz = this.plane.z - ring.z;
      if (dx * dx + dy * dy + dz * dz < ring.r * ring.r) {
        ring.passed = true;
        this.ringsPassed++;
        this.score += CONFIG.ringPoints;
        this.sound.chime();
        this.setMessage(`RING ${this.ringsPassed} OF ${this.rings.length}  ·  +${CONFIG.ringPoints}`);
        if (this.ringsPassed >= this.rings.length) this.completeMission();
      }
    }

    // Landing: gentle touchdown on the runway refuels, repairs and scores.
    if (this.plane.onGround && this.world.onRunway(this.plane.x, this.plane.z)) {
      if (this.plane.speed > 2 && Math.abs(this.plane.verticalSpeed) < 1) {
        if (!this.landedBonusGiven && this.plane.speed < 45) {
          this.landedBonusGiven = true;
          this.score += CONFIG.landingPoints;
          this.plane.fuel = CONFIG.fuelCapacity;
          this.plane.damage = 0;
          this.sound.land();
          this.setMessage(`TOUCHDOWN  ·  +${CONFIG.landingPoints}  ·  REFUELLED`);
        }
      }
    } else {
      this.landedBonusGiven = false;
    }

    // Crash: the plane reports an impact (terrain, sea, or a hard arrival).
    if (this.plane.impact) {
      const reason =
        this.plane.impact === 'sea'
          ? 'DITCHED IN THE SEA'
          : this.plane.impact === 'hard'
            ? 'HARD IMPACT'
            : 'TERRAIN IMPACT';
      this.crash(reason);
      return;
    }
    // Stranded: out of fuel on the ground, away from the runway.
    if (this.plane.fuel <= 0 && this.plane.onGround && this.plane.speed < 5 && !this.world.onRunway(this.plane.x, this.plane.z)) {
      this.crash('OUT OF FUEL — STRANDED');
      return;
    }

    // Hard landing damage.
    if (this.plane.onGround && this.plane.speed > 55 && this.world.onRunway(this.plane.x, this.plane.z)) {
      this.plane.damage += dt * 12;
    }
  }

  completeMission() {
    const fuelBonus = Math.round(this.plane.fuel * 2);
    this.score += CONFIG.missionPoints + fuelBonus;
    this.sound.fanfare();
    if (this.missionIndex < MISSIONS.length - 1) {
      this.missionIndex++;
      this.rings = this.world.buildCourse(this.mission.id);
      this.ringsPassed = 0;
      this.setMessage(`MISSION COMPLETE  ·  +${CONFIG.missionPoints + fuelBonus}`, 3.5);
    } else {
      // Campaign complete: loop back harder with a fresh course and full fuel.
      this.missionIndex = 0;
      this.rings = this.world.buildCourse(1);
      this.ringsPassed = 0;
      this.plane.fuel = CONFIG.fuelCapacity;
      this.setMessage(`CAMPAIGN COMPLETE  ·  +${CONFIG.missionPoints + fuelBonus}  ·  FLY IT AGAIN`, 3.5);
    }
  }

  crash(reason) {
    this.crashReason = reason;
    this.lives--;
    this.sound.crash();
    this.state = 'crashed';
    this.crashTimer = 2.2;
    this.setMessage(reason, 2.2);
  }

  respawn() {
    this.plane.reset();
    this.plane.throttle = 0.55;
    this.state = 'flying';
    this.setMessage('BACK ON THE RUNWAY — FLY SAFE');
  }

  saveBest() {
    if (this.score > this.best) {
      this.best = this.score;
      try {
        window.localStorage.setItem('skyline-courier-best', String(this.best));
      } catch {
        // Storage may be unavailable; the in-memory best still shows.
      }
    }
  }

  render() {
    const { ctx } = this.renderer;
    const W = this.renderer.width;
    const H = this.renderer.height;
    this.renderer.render(this, this.time);
    if (this.state === 'title') {
      drawTitle(ctx, W, H, this.best, this.time);
    } else {
      drawHUD(ctx, W, H, {
        plane: this.plane,
        score: this.score,
        best: Math.max(this.best, this.score),
        rings: this.ringsPassed,
        ringsTotal: this.rings.length,
        lives: this.lives,
        fuel: this.plane.fuel,
        mission: this.mission,
        message: this.message,
        messageT: this.messageT,
        time: this.time,
      });
      if (this.state === 'paused') {
        drawOverlay(ctx, W, H, 'PAUSED', 'Take a breath, courier.', 'Press P to keep flying · M to mute');
      } else if (this.state === 'crashed') {
        drawOverlay(ctx, W, H, this.crashReason, `Lives left: ${this.lives}`, this.lives > 0 ? 'Back on the runway shortly…' : '');
      } else if (this.state === 'over') {
        drawOverlay(
          ctx, W, H,
          'OUT OF PLANES',
          `Final score ${String(this.score).padStart(6, '0')}  ·  Best ${String(Math.max(this.best, this.score)).padStart(6, '0')}`,
          'Press R or click to fly again',
        );
      }
    }
  }

  // ---- Screenshot modes: ?shot=start|play|rings|end&seed=N ----
  // Each runs a fixed, seeded simulation and freezes on one frame.
  setupShot(shot) {
    this.shotMode = shot;
    this.renderer.resize(1280, 720);
    if (shot === 'start') {
      this.state = 'title';
      this.plane.reset();
      this.plane.throttle = 0;
      this.time = 0.5;
    } else if (shot === 'play') {
      this.state = 'flying';
      this.plane.reset();
      this.plane.throttle = 0.85;
      this.scriptedFlight(600, { roll: 0.08, pitch: -0.8 });
      this.setMessage('FLY THROUGH THE GOLD RINGS', 3);
    } else if (shot === 'rings') {
      this.state = 'flying';
      this.plane.reset();
      this.plane.throttle = 0.8;
      // Steer toward the first ring so the shot frames it dead ahead.
      this.scriptedFlight(780, { roll: 0.05, pitch: -0.2, aimRing: true });
      this.setMessage('RING 1 OF 8', 3);
    } else if (shot === 'end') {
      this.state = 'over';
      this.score = 1250;
      this.best = 1250;
      this.lives = 0;
      this.plane.reset();
      this.plane.throttle = 0;
      this.time = 0.5;
    }
    this.render();
    window.__shotReady = true;
  }

  // Run the sim with fixed inputs for n frames at 1/60 s.
  scriptedFlight(frames, script) {
    const dt = 1 / 60;
    for (let i = 0; i < frames; i++) {
      let roll = script.roll || 0;
      let pitch = script.pitch || 0;
      if (script.aimRing) {
        const ring = this.rings[0];
        const dx = ring.x - this.plane.x;
        const dz = ring.z - this.plane.z;
        const want = Math.atan2(dx, dz);
        const diff = ((want - this.plane.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        roll = clamp(diff * 1.4, -0.6, 0.6);
        const dy = ring.y - this.plane.y;
        pitch = clamp(-dy * 0.02, -1, 0.5);
      }
      const input = {
        roll,
        pitch,
        throttleUp: false,
        throttleDown: false,
        brake: false,
      };
      const wind = this.world.windAt(this.time, this.mission.id);
      this.plane.update(input, wind, dt, this.world);
      this.time += dt;
      // Stop early if the scripted flight hits something.
      if (this.plane.impact) break;
    }
  }
}
