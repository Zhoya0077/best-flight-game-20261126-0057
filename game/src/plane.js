// Skyline Courier — the courier plane.
// One job: arcade flight physics (throttle, bank, pitch, stall, wind) and
// the chase-view drawing of the aircraft itself.

import { CONFIG, approach, clamp, wrapAngle } from './config.js';

export class Plane {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0.4; // parked on the runway surface
    this.z = 0;
    this.heading = 0; // 0 = along +z, the runway direction
    this.pitch = 0; // radians, positive = nose up
    this.roll = 0; // radians, positive = banked right
    this.speed = 0;
    this.throttle = 0;
    this.fuel = CONFIG.fuelCapacity;
    this.damage = 0;
    this.verticalSpeed = 0;
    this.onGround = true;
    this.propAngle = 0;
    this.stalled = false;
    this.impact = null;
  }

  // One physics step. input: {pitch, roll, throttleUp, throttleDown, brake}.
  // wind: lateral push in m/s. dt in seconds.
  update(input, wind, dt, world) {
    // Throttle
    if (input.throttleUp) this.throttle = approach(this.throttle, 1, dt * 0.7);
    if (input.throttleDown) this.throttle = approach(this.throttle, 0, dt * 0.7);
    if (input.brake) this.throttle = approach(this.throttle, 0, dt * 1.6);

    const targetSpeed = this.throttle * CONFIG.maxSpeed;
    this.speed = approach(this.speed, targetSpeed, dt * (this.throttle > 0 ? 9 : 14));
    if (input.brake) this.speed = approach(this.speed, 0, dt * 22);

    // Bank toward the stick, then turn with the bank.
    const targetRoll = input.roll * CONFIG.maxBank;
    this.roll = approach(this.roll, targetRoll, dt * 2.4);
    this.heading = wrapAngle(this.heading + Math.sin(this.roll) * CONFIG.turnRate * (this.speed / CONFIG.maxSpeed) * dt * 2.2);

    // Pitch toward the stick; a slow plane cannot hold its nose up.
    const targetPitch = input.pitch * CONFIG.maxPitch;
    this.pitch = approach(this.pitch, targetPitch, dt * 1.8);
    this.stalled = !this.onGround && this.speed < CONFIG.minSpeed;
    let climb = -Math.sin(this.pitch) * CONFIG.climbRate * (this.speed / CONFIG.maxSpeed);
    // A stalled wing cannot hold altitude: she sinks, gently at first, and a
    // slow sink onto flat ground is a rough landing, not an explosion.
    if (this.stalled) climb -= 8 * (1 - this.speed / CONFIG.minSpeed);

    // Move.
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    this.x += fx * this.speed * dt + wind * dt * 0.5;
    this.z += fz * this.speed * dt;
    this.verticalSpeed = climb;
    this.y += climb * dt;

    // Ground contact: a gentle touchdown on the strip is a landing; anything
    // else at speed, or a hard vertical arrival, is an impact the game reads.
    this.impact = null;
    const ground = world.heightAt(this.x, this.z);
    if (this.y <= ground + 0.4) {
      const arriving = this.verticalSpeed;
      const onStrip = world.onRunway(this.x, this.z);
      if (!onStrip && this.speed > 25) {
        this.impact = world.isSea(this.x, this.z) ? 'sea' : 'terrain';
      } else if (arriving < -9) {
        this.impact = 'hard';
      }
      this.y = ground + 0.4;
      this.onGround = true;
      this.verticalSpeed = 0;
    } else {
      this.onGround = false;
    }

    // Fuel burns with throttle; empty tanks mean a glide, then a ditch.
    const burn = CONFIG.fuelBurnIdle + (CONFIG.fuelBurn - CONFIG.fuelBurnIdle) * this.throttle;
    this.fuel = Math.max(0, this.fuel - burn * dt);
    if (this.fuel <= 0) this.throttle = approach(this.throttle, 0, dt);

    this.propAngle += dt * (4 + this.throttle * 42);
  }

  // Draw the aircraft from the chase view at screen (cx, cy), banked by roll.
  // scale grows slightly with speed so the plane feels alive.
  draw(ctx, cx, cy, scale) {
    const roll = this.roll;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(roll * 0.9);
    ctx.scale(scale, scale);

    // Propeller disc (spinning blur) and hub.
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#cfd6dd';
    ctx.beginPath();
    ctx.ellipse(0, -46, 7, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2b3138';
    ctx.beginPath();
    ctx.arc(0, -46, 5, 0, Math.PI * 2);
    ctx.fill();

    // Tailplane and fin.
    ctx.fillStyle = '#c8442c';
    ctx.beginPath();
    ctx.moveTo(-34, 34);
    ctx.lineTo(34, 34);
    ctx.lineTo(24, 22);
    ctx.lineTo(-24, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a83220';
    ctx.beginPath();
    ctx.moveTo(0, 36);
    ctx.lineTo(0, 2);
    ctx.lineTo(10, 30);
    ctx.closePath();
    ctx.fill();

    // Wings: bright courier orange with a white tip stripe.
    ctx.fillStyle = '#e8603a';
    ctx.beginPath();
    ctx.moveTo(-78, 6);
    ctx.lineTo(78, 6);
    ctx.lineTo(58, -12);
    ctx.lineTo(-58, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4f6f8';
    ctx.fillRect(-78, 2, 14, 6);
    ctx.fillRect(64, 2, 14, 6);

    // Fuselage: shaded tube with a courier stripe and canopy.
    const body = ctx.createLinearGradient(-14, 0, 14, 0);
    body.addColorStop(0, '#f2f5f7');
    body.addColorStop(0.5, '#ffffff');
    body.addColorStop(1, '#c9d2d8');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.quadraticCurveTo(13, -30, 12, 6);
    ctx.quadraticCurveTo(11, 30, 0, 40);
    ctx.quadraticCurveTo(-11, 30, -12, 6);
    ctx.quadraticCurveTo(-13, -30, 0, -52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8603a';
    ctx.fillRect(-12, -6, 24, 7);
    // Canopy.
    ctx.fillStyle = '#7fc4e8';
    ctx.beginPath();
    ctx.ellipse(0, -26, 8, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-3, -30, 3, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Registration.
    ctx.fillStyle = '#33414d';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SKY-01', 0, 24);

    // Navigation lights: red left, green right.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-78, 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2ecc40';
    ctx.beginPath();
    ctx.arc(78, 4, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
