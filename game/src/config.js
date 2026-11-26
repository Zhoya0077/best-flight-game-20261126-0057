// Skyline Courier — shared tuning and helpers.
// One job: constants and the seeded random number generator every other
// module uses, so a screenshot seed replays the same world every time.

export const CONFIG = {
  // World
  seaLevel: 0,
  worldSeed: 7,
  // Plane performance
  maxSpeed: 92, // m/s at full throttle
  minSpeed: 22, // stall speed; below this the nose drops
  cruiseSpeed: 55,
  climbRate: 30, // m/s of vertical speed at full climb
  turnRate: 0.55, // rad/s of heading change at full bank
  maxBank: 0.9, // rad of roll
  maxPitch: 0.45, // rad
  // Fuel and damage
  fuelCapacity: 100,
  fuelBurn: 1.15, // units per second at full throttle
  fuelBurnIdle: 0.25,
  damagePerHardLanding: 34,
  // Scoring
  ringPoints: 100,
  landingPoints: 250,
  missionPoints: 500,
  // Rings
  ringRadius: 16,
  ringSpacing: 260,
  // Lives
  lives: 3,
  // Runway: strip along +z from the origin
  runway: { x: 0, z0: -60, z1: 320, halfWidth: 14 },
  // Camera
  camDistance: 26,
  camHeight: 9,
  fov: 1.05, // radians, vertical-ish field of view
};

// Mulberry32: small deterministic PRNG. seed is an integer.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Clamp a number into [lo, hi].
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Move v toward target by at most step.
export function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

// Smooth interpolation helper for camera and needle motion.
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Wrap an angle to [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Format helpers for the HUD readouts.
export function fmtInt(n) {
  return String(Math.max(0, Math.round(n)));
}
export function pad3(n) {
  const s = String(Math.round(n) % 360);
  return s.padStart(3, '0');
}
