// Skyline Courier — the island world.
// One job: terrain height, the runway, the ring course, clouds and wind.
// Everything is a pure function of the seed, so the same seed builds the
// same archipelago, the same rings and the same weather every run.

import { CONFIG, clamp, mulberry32 } from './config.js';

// Value-noise heightfield: a few octaves of smoothed grid noise.
function makeNoise(seed) {
  const rand = mulberry32(seed);
  const size = 64;
  const grid = [];
  for (let o = 0; o < 3; o++) {
    const g = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) g[i] = rand();
    grid.push(g);
  }
  function sample(g, x, z) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const s = (a, b) => a + (b - a) * (xf * xf * (3 - 2 * xf));
    const x0 = ((xi % size) + size) % size;
    const x1 = (x0 + 1) % size;
    const z0 = ((zi % size) + size) % size;
    const z1 = (z0 + 1) % size;
    const a = s(g[z0 * size + x0], g[z0 * size + x1]);
    const b = s(g[z1 * size + x0], g[z1 * size + x1]);
    return a + (b - a) * (zf * zf * (3 - 2 * zf));
  }
  return (x, z) => {
    let h = 0;
    h += sample(grid[0], x * 0.004, z * 0.004) * 0.62;
    h += sample(grid[1], x * 0.011, z * 0.011) * 0.28;
    h += sample(grid[2], x * 0.03, z * 0.03) * 0.1;
    return h; // 0..1
  };
}

export class World {
  constructor(seed) {
    this.seed = seed;
    this.noise = makeNoise(seed);
    const rand = mulberry32(seed * 31 + 5);
    // A handful of hand-placed islands so the course always has landmarks.
    this.peaks = [];
    for (let i = 0; i < 26; i++) {
      const px = (rand() - 0.5) * 5200;
      const pz = 300 + rand() * 5200;
      const pr = 260 + rand() * 620;
      const ph = 42 + rand() * 96;
      this.peaks.push({ x: px, z: pz, r: pr, h: ph });
    }
    // Clouds: fixed world positions, drawn as soft billboards.
    this.clouds = [];
    for (let i = 0; i < 30; i++) {
      this.clouds.push({
        x: (rand() - 0.5) * 6000,
        y: 190 + rand() * 140,
        z: -300 + rand() * 6000,
        s: 45 + rand() * 80,
      });
    }
    // Wind for the storm mission: a steady crosswind plus gusts.
    this.windBase = 0;
    this.gustPhase = rand() * Math.PI * 2;
  }

  // Terrain height in metres at world (x, z). 0 or below is open sea.
  heightAt(x, z) {
    // Flatten the runway strip so takeoffs and landings are level ground.
    const r = CONFIG.runway;
    const dx = Math.abs(x - r.x);
    if (dx < r.halfWidth + 40 && z > r.z0 - 80 && z < r.z1 + 380) {
      // Flat on the strip and its departure valley, blending out over 34 m
      // to either side and 120 m past each end, so a new pilot climbing
      // straight ahead never meets a hillside at 200 m.
      const edge = clamp((dx - (r.halfWidth + 6)) / 34, 0, 1);
      const along = clamp(Math.min(z - (r.z0 - 80), r.z1 + 380 - z) / 120, 0, 1);
      const f = Math.max(edge, 1 - along);
      return this.rawHeight(x, z) * f;
    }
    return this.rawHeight(x, z);
  }

  rawHeight(x, z) {
    const n = this.noise(x, z);
    // Gentle rolling ground near the airfield, full mountains far away.
    const near = clamp(Math.hypot(x, z) / 1300, 0.35, 1);
    // Sea level sits at n ~ 0.42; land rises steeply above it.
    let h = (n - 0.42) * 260 * near;
    if (h < 0) h *= 0.35; // seabed stays shallow
    for (const p of this.peaks) {
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      const rr = p.r * p.r;
      if (d2 < rr) {
        const fall = 1 - d2 / rr;
        h += p.h * fall * fall * near;
      }
    }
    return h;
  }

  isSea(x, z) {
    return this.heightAt(x, z) < 1.5;
  }

  onRunway(x, z) {
    const r = CONFIG.runway;
    return Math.abs(x - r.x) <= r.halfWidth && z >= r.z0 && z <= r.z1;
  }

  // Build a ring course: a winding line of rings ahead of the runway.
  // mission: 1 = Ring Run, 2 = Island Hop, 3 = Storm Courier.
  buildCourse(mission) {
    const rand = mulberry32(this.seed * 97 + mission * 13);
    const rings = [];
    const count = mission === 1 ? 8 : mission === 2 ? 8 : 10;
    let x = 0;
    let z = 420;
    let heading = 0;
    for (let i = 0; i < count; i++) {
      heading += (rand() - 0.5) * 0.9;
      heading = Math.max(-1.1, Math.min(1.1, heading));
      const step = CONFIG.ringSpacing + rand() * 120;
      x += Math.sin(heading) * step;
      z += Math.cos(heading) * step;
      const alt = 45 + rand() * (mission === 3 ? 85 : 65);
      rings.push({ x, y: alt, z, r: CONFIG.ringRadius, passed: false });
    }
    return rings;
  }

  // Wind at time t (seconds): returns lateral push in m/s, 0 in calm missions.
  windAt(t, mission) {
    if (mission !== 3) return 0;
    return 9 + 7 * Math.sin(t * 0.6 + this.gustPhase) + 4 * Math.sin(t * 1.7);
  }
}
