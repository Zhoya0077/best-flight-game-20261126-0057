// Skyline Courier — the chase-view renderer.
// One job: turn the world and the plane into a picture. A small software
// camera projects the terrain heightfield, the sea, the runway, the rings
// and the clouds onto the canvas, then the plane is drawn over it.

import { CONFIG, clamp, lerp } from './config.js';

const SKY_TOP = '#2f6fb2';
const SKY_MID = '#7fb2dd';
const SKY_HORIZON = '#dceef7';
const SEA_FAR = '#3f7fa8';
const SEA_NEAR = '#2b6d94';

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}

function terrainColor(h, slope) {
  if (h < 3) return '#d9c48a'; // beach sand
  if (h < 45) return slope > 0.55 ? '#8a7a5c' : '#5da24a'; // grass
  if (h < 85) return slope > 0.5 ? '#7d7468' : '#4c8a44'; // high grass / rock
  if (h < 115) return '#6f6a63'; // rock
  return '#e8eef2'; // snow caps
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.f = (this.height / 2) / Math.tan(CONFIG.fov / 2);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.width = w;
    this.height = h;
    this.f = (h / 2) / Math.tan(CONFIG.fov / 2);
  }

  // Camera basis from the plane: behind and above, looking ahead.
  camera(plane) {
    const fx = Math.sin(plane.heading);
    const fz = Math.cos(plane.heading);
    const cx = plane.x - fx * CONFIG.camDistance;
    const cz = plane.z - fz * CONFIG.camDistance;
    const cy = plane.y + CONFIG.camHeight;
    const lookX = plane.x + fx * 60;
    const lookZ = plane.z + fz * 60;
    const lookY = plane.y + 4;
    // Forward vector (normalised).
    let fwdX = lookX - cx;
    let fwdY = lookY - cy;
    let fwdZ = lookZ - cz;
    const fl = Math.hypot(fwdX, fwdY, fwdZ);
    fwdX /= fl;
    fwdY /= fl;
    fwdZ /= fl;
    // Right = forward x world-up, up = right x forward.
    let rx = fwdZ;
    let rz = -fwdX;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const ux = -fwdY * rz;
    const uy = fwdZ * rx - fwdX * rz;
    const uz = fwdY * rx;
    return { x: cx, y: cy, z: cz, fx: fwdX, fy: fwdY, fz: fwdZ, rx, ry: 0, rz, ux, uy, uz };
  }

  project(cam, x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const cz = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (cz < 2) return null;
    const cx = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const cy = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    return {
      x: this.width / 2 + (cx / cz) * this.f,
      y: this.height / 2 - (cy / cz) * this.f,
      d: cz,
    };
  }

  render(state, time) {
    const { ctx, width: W, height: H } = this;
    const { world, plane, rings } = state;
    const cam = this.camera(plane);

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(0.55, SKY_MID);
    sky.addColorStop(0.78, SKY_HORIZON);
    sky.addColorStop(1, '#cfe3ea');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Sun.
    const sunX = W * 0.78;
    const sunY = H * 0.16;
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255,246,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,238,170,0.55)');
    glow.addColorStop(1, 'rgba(255,238,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
    ctx.fillStyle = '#fff7cf';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
    ctx.fill();

    // Distant mountain silhouettes, parallaxed by heading.
    this.drawRidge(ctx, W, H, plane.heading, 0.22, 0.52, '#8fb4cf', 46);
    this.drawRidge(ctx, W, H, plane.heading, 0.45, 0.62, '#6f9cbd', 70);

    // Sea: a wide quad at y=0, projected.
    this.drawSea(ctx, cam, time);

    // The airfield island: a dry-grass base under the runway so the home
    // field reads as land, with the sea beyond its shore.
    this.drawIsland(ctx, cam);

    // Terrain heightfield, far rows first.
    this.drawTerrain(ctx, cam, world);

    // Runway strip.
    this.drawRunway(ctx, cam, world);

    // Clouds as soft billboards.
    this.drawClouds(ctx, cam, world, time);

    // Rings, farthest first so near ones overlap correctly.
    const sorted = [...rings].sort((a, b) => {
      const da = (a.x - plane.x) ** 2 + (a.z - plane.z) ** 2;
      const db = (b.x - plane.x) ** 2 + (b.z - plane.z) ** 2;
      return db - da;
    });
    for (const ring of sorted) this.drawRing(ctx, cam, ring, time);

    // The plane's shadow on the ground below, sized to the aircraft sprite
    // and fading as she climbs away from the ground.
    const groundY = world.heightAt(plane.x, plane.z);
    const sh = this.project(cam, plane.x, groundY + 0.6, plane.z);
    if (sh && plane.y - groundY < 220) {
      const altFrac = clamp((plane.y - groundY) / 220, 0, 1);
      const sw = 78 * (1 - altFrac * 0.55);
      ctx.fillStyle = `rgba(20,30,40,${clamp(0.32 - altFrac * 0.24, 0.06, 0.32)})`;
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, Math.max(6, sw), Math.max(3, sw * 0.3), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // The aircraft, banked, low in the frame.
    const scale = clamp(1.05 + plane.speed / 220, 1.05, 1.35);
    plane.draw(ctx, W / 2, H * 0.66, scale);

    // Speed lines when fast and low.
    if (plane.speed > 62 && !plane.onGround) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const sx = ((i * 173 + time * 900) % (W + 200)) - 100;
        const sy = H * 0.25 + ((i * 97) % Math.floor(H * 0.5));
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 46, sy + 6);
        ctx.stroke();
      }
    }
  }

  drawRidge(ctx, W, H, heading, parallax, baseY, color, amp) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const offset = ((heading * parallax * W) % (W * 2) + W * 2) % (W * 2);
    for (let x = -40; x <= W + 40; x += 40) {
      const xx = x - offset + W;
      const h = baseY * H - (Math.sin((x + offset) * 0.011) * 0.5 + Math.sin((x + offset) * 0.027 + 2) * 0.3 + 0.2) * amp;
      ctx.lineTo(xx > W + 40 ? W + 40 : xx, h);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  drawIsland(ctx, cam) {
    // An irregular blob of dry grass around the runway, at y=0.6. Points
    // behind the camera are pinned to the bottom edge so the island's near
    // shore runs off the bottom of the screen, as it should.
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const wobble = 0.82 + 0.18 * Math.sin(a * 3 + 1.7) + 0.08 * Math.sin(a * 7);
      const wx = Math.cos(a) * 480 * wobble;
      const wz = 140 + Math.sin(a) * 460 * wobble;
      const p = this.project(cam, wx, 0.6, wz);
      if (p) pts.push(p);
      else pts.push({ x: clamp(this.width / 2 + (wx - cam.x) * 2, -100, this.width + 100), y: this.height + 20 });
    }
    if (pts.length < 3) return;
    ctx.fillStyle = '#a9a86b';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  drawSea(ctx, cam, time) {
    const { width: W, height: H } = this;
    // Project the four corners of a big sea quad and fill the polygon.
    const pts = [];
    for (const [ox, oz] of [[-2600, -400], [2600, -400], [2600, 2600], [-2600, 2600]]) {
      const wx = cam.x + cam.rx * ox + cam.fx * oz;
      const wz = cam.z + cam.rz * ox + cam.fz * oz;
      const p = this.project(cam, wx, 0, wz);
      if (p) pts.push(p);
    }
    if (pts.length < 3) return;
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, SEA_FAR);
    g.addColorStop(1, SEA_NEAR);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    // Sun glitter on the water.
    ctx.strokeStyle = 'rgba(255,250,220,0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const y = H * 0.62 + i * 14 + Math.sin(time * 1.3 + i) * 3;
      const x0 = W * 0.62 + Math.sin(i * 2.7 + time) * 40;
      ctx.beginPath();
      ctx.moveTo(x0 - 26 - i * 2, y);
      ctx.lineTo(x0 + 26 + i * 2, y);
      ctx.stroke();
    }
  }

  drawTerrain(ctx, cam, world) {
    const rows = 18;
    const cols = 20;
    const stepF = 78;
    const stepL = 55;
    // Grid vertices in camera space, projected once.
    const grid = [];
    for (let i = 0; i <= rows; i++) {
      const row = [];
      const dist = 40 + i * stepF;
      for (let j = -cols / 2; j <= cols / 2; j++) {
        const wx = cam.x + cam.fx * dist + cam.rx * j * stepL;
        const wz = cam.z + cam.fz * dist + cam.rz * j * stepL;
        const h = world.heightAt(wx, wz);
        const p = this.project(cam, wx, h, wz);
        row.push({ p, h, x: wx, z: wz });
      }
      grid.push(row);
    }
    // Draw far to near so near triangles overlap far ones.
    for (let i = rows - 1; i >= 0; i--) {
      for (let j = 0; j < cols; j++) {
        const a = grid[i][j];
        const b = grid[i][j + 1];
        const c = grid[i + 1][j];
        const d = grid[i + 1][j + 1];
        this.terrainQuad(ctx, a, b, d, c, i, rows);
      }
    }
  }

  terrainQuad(ctx, a, b, c, d, row, rows) {
    // Skip quads that are fully sea and below the horizon line already drawn.
    const hMax = Math.max(a.h, b.h, c.h, d.h);
    if (hMax < 1.2) return;
    if (!a.p || !b.p || !c.p || !d.p) return;
    const hAvg = (a.h + b.h + c.h + d.h) / 4;
    const slope = Math.abs(a.h - c.h) + Math.abs(b.h - d.h);
    let color = terrainColor(hAvg, slope / 140);
    const fog = clamp(row / rows, 0, 1);
    color = mixHex(color, SKY_HORIZON, fog * fog * 0.55);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.p.x, a.p.y);
    ctx.lineTo(b.p.x, b.p.y);
    ctx.lineTo(c.p.x, c.p.y);
    ctx.lineTo(d.p.x, d.p.y);
    ctx.closePath();
    ctx.fill();
  }

  drawRunway(ctx, cam) {
    const r = CONFIG.runway;
    // The strip's near end may sit behind the camera; start the quad just
    // ahead of it instead of skipping the whole runway.
    const zStart = Math.max(r.z0, cam.z + 8);
    const corners = [
      this.project(cam, r.x - r.halfWidth, 0.5, zStart),
      this.project(cam, r.x + r.halfWidth, 0.5, zStart),
      this.project(cam, r.x + r.halfWidth, 0.5, r.z1),
      this.project(cam, r.x - r.halfWidth, 0.5, r.z1),
    ];
    if (corners.some((p) => !p)) return;
    ctx.fillStyle = '#3a4148';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    ctx.fillStyle = '#f5f7f8';
    for (let z = r.z0 + 20; z < r.z1; z += 40) {
      const p1 = this.project(cam, r.x - 1, 0.7, z);
      const p2 = this.project(cam, r.x + 1, 0.7, z);
      const p3 = this.project(cam, r.x + 1, 0.7, z + 18);
      const p4 = this.project(cam, r.x - 1, 0.7, z + 18);
      if (!p1 || !p2 || !p3 || !p4) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    }
    // Threshold chevrons at the near end.
    const t1 = this.project(cam, r.x - r.halfWidth + 2, 0.7, r.z0 + 6);
    const t2 = this.project(cam, r.x + r.halfWidth - 2, 0.7, r.z0 + 6);
    if (t1 && t2) {
      ctx.strokeStyle = '#f5f7f8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.stroke();
    }
  }

  drawClouds(ctx, cam, world, time) {
    for (const c of world.clouds) {
      const p = this.project(cam, c.x, c.y, c.z);
      if (!p || p.d < 30) continue;
      const s = (c.s * this.f) / p.d;
      if (s < 4 || s > 240) continue; // never let one cloud fill the screen
      const drift = Math.sin(time * 0.2 + c.x * 0.01) * 4;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(p.x + drift, p.y, s, s * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - s * 0.45 + drift, p.y + s * 0.08, s * 0.6, s * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + s * 0.45 + drift, p.y + s * 0.06, s * 0.55, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRing(ctx, cam, ring, time) {
    const p = this.project(cam, ring.x, ring.y, ring.z);
    if (!p) return;
    const r = (ring.r * this.f) / p.d;
    if (r < 2 || r > 900) return;
    const pulse = 1 + Math.sin(time * 3 + ring.z * 0.01) * 0.05;
    const rr = r * pulse;
    ctx.save();
    ctx.globalAlpha = clamp(1.15 - p.d / 1600, 0.25, 1);
    // Glow.
    ctx.strokeStyle = ring.passed ? 'rgba(80,220,120,0.9)' : 'rgba(255,190,60,0.95)';
    ctx.lineWidth = Math.max(2, rr * 0.14);
    ctx.shadowColor = ring.passed ? '#50dc78' : '#ffbe3c';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.stroke();
    // Inner rim.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = ring.passed ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, rr * 0.045);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr * 0.86, 0, Math.PI * 2);
    ctx.stroke();
    // Chevrons pointing in, so the ring reads as a target.
    if (!ring.passed) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + time * 0.4;
        const cx = p.x + Math.cos(a) * rr * 0.6;
        const cy = p.y + Math.sin(a) * rr * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1.5, rr * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
