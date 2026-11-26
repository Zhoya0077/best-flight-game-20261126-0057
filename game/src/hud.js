// Skyline Courier — the cockpit instruments.
// One job: draw the HUD — altitude, speed, heading, compass, fuel, score,
// lives, throttle, mission banner and the artificial horizon — all in the
// canvas so every screenshot carries the instruments lit.

import { CONFIG, clamp, pad3 } from './config.js';

export function drawHUD(ctx, W, H, state) {
  const { plane, score, best, rings, ringsTotal, lives, fuel, mission, message, messageT, time } = state;
  const altFt = Math.round(plane.y * 3.28084);
  const spdKt = Math.round(plane.speed * 1.94384);
  const hdg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // ---- Top centre: compass strip ----
  const cx = W / 2;
  const cy = 30;
  ctx.fillStyle = 'rgba(10,22,34,0.55)';
  roundRect(ctx, cx - 190, cy - 18, 380, 36, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 190, cy - 18, 380, 36);
  ctx.clip();
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  for (let d = -180; d <= 180; d += 15) {
    const a = ((hdg + d) % 360 + 360) % 360;
    const x = cx + d * 1.05;
    const major = a % 45 === 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, cy + (major ? -8 : -4));
    ctx.lineTo(x, cy + 2);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dirs[Math.round(a / 45) % 8], x, cy + 15);
    }
  }
  ctx.restore();
  // Heading caret + digital readout.
  ctx.fillStyle = '#ffbe3c';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 18);
  ctx.lineTo(cx - 6, cy - 26);
  ctx.lineTo(cx + 6, cy - 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HDG ' + pad3(hdg), cx, cy - 30);

  // ---- Top left: instrument cluster ----
  const ix = 18;
  const iy = 18;
  ctx.fillStyle = 'rgba(10,22,34,0.55)';
  roundRect(ctx, ix, iy, 208, 128, 10);
  ctx.fill();
  // Artificial horizon.
  const hx = ix + 46;
  const hy = iy + 46;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, 34, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(hx, hy);
  ctx.rotate(-plane.roll);
  const pitchOff = clamp(plane.pitch * 60, -30, 30);
  ctx.fillStyle = '#4a90c4';
  ctx.fillRect(-40, -40 + pitchOff, 80, 40 - pitchOff);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-40, pitchOff, 80, 40 - pitchOff + 40);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-40, pitchOff - 1, 80, 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(hx, hy, 34, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol over the horizon.
  ctx.fillStyle = '#ffbe3c';
  ctx.beginPath();
  ctx.moveTo(hx, hy - 4);
  ctx.lineTo(hx - 4, hy + 4);
  ctx.lineTo(hx + 4, hy + 4);
  ctx.closePath();
  ctx.fill();
  // Digital readouts.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fd8ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('ALT', ix + 96, iy + 26);
  ctx.fillText('SPD', ix + 96, iy + 56);
  ctx.fillText('VSI', ix + 96, iy + 86);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 17px monospace';
  ctx.fillText(altFt.toLocaleString('en-US') + ' ft', ix + 96, iy + 44);
  ctx.fillText(spdKt + ' kt', ix + 96, iy + 74);
  const vsi = Math.round(plane.verticalSpeed * 196.85);
  ctx.fillText((vsi >= 0 ? '+' : '') + vsi + ' fpm', ix + 96, iy + 104);
  // Stall warning.
  if (plane.stalled) {
    ctx.fillStyle = time % 0.6 < 0.3 ? '#ff5040' : '#ffb0a0';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STALL — NOSE DOWN, ADD POWER', cx, 92);
  }

  // ---- Top right: score, rings, fuel, lives ----
  const rx = W - 226;
  ctx.fillStyle = 'rgba(10,22,34,0.55)';
  roundRect(ctx, rx, iy, 208, 128, 10);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fd8ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('SCORE', rx + 14, iy + 26);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(String(score).padStart(6, '0'), rx + 14, iy + 48);
  ctx.fillStyle = '#9fd8ff';
  ctx.font = '11px sans-serif';
  ctx.fillText('BEST ' + String(best).padStart(6, '0'), rx + 130, iy + 26);
  // Ring pips.
  ctx.fillStyle = '#9fd8ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('RINGS', rx + 14, iy + 72);
  for (let i = 0; i < ringsTotal; i++) {
    ctx.fillStyle = i < rings ? '#ffbe3c' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(rx + 66 + i * 16, iy + 68, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fuel bar.
  ctx.fillStyle = '#9fd8ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('FUEL', rx + 14, iy + 100);
  const fw = 120;
  const fuelFrac = clamp(fuel / CONFIG.fuelCapacity, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  roundRect(ctx, rx + 58, iy + 90, fw, 12, 6);
  ctx.fill();
  ctx.fillStyle = fuelFrac > 0.3 ? '#57d977' : fuelFrac > 0.15 ? '#ffbe3c' : '#ff5040';
  roundRect(ctx, rx + 58, iy + 90, Math.max(4, fw * fuelFrac), 12, 6);
  ctx.fill();
  // Lives as little planes.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < lives ? '#fff' : 'rgba(255,255,255,0.2)';
    drawMiniPlane(ctx, rx + 66 + i * 22, iy + 122, i < lives);
  }
  if (fuelFrac <= 0.15 && fuelFrac > 0) {
    ctx.fillStyle = time % 0.6 < 0.3 ? '#ff5040' : '#ffb0a0';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOW FUEL — LAND ON THE RUNWAY TO REFUEL', cx, 116);
  }

  // ---- Bottom left: throttle ----
  const tx = 18;
  const ty = H - 130;
  ctx.fillStyle = 'rgba(10,22,34,0.55)';
  roundRect(ctx, tx, ty, 46, 112, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  roundRect(ctx, tx + 14, ty + 12, 18, 60, 6);
  ctx.fill();
  const th = clamp(plane.throttle, 0, 1);
  ctx.fillStyle = th > 0.85 ? '#ff5040' : '#57d977';
  roundRect(ctx, tx + 14, ty + 72 - 60 * th, 18, 60 * th, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THR', tx + 23, ty + 88);
  ctx.fillText(Math.round(th * 100) + '%', tx + 23, ty + 102);

  // ---- Bottom centre: mission + message ----
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(10,22,34,0.55)';
  const mText = mission.name + '  —  ' + mission.objective;
  ctx.font = 'bold 14px sans-serif';
  const mw = ctx.measureText(mText).width + 28;
  roundRect(ctx, cx - mw / 2, H - 46, mw, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(mText, cx, H - 26);
  if (message && messageT > 0) {
    ctx.globalAlpha = clamp(messageT, 0, 1);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(message, cx, H * 0.3);
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMiniPlane(ctx, x, y, lit) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = lit ? '#ffbe3c' : 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(3, 3);
  ctx.lineTo(8, 5);
  ctx.lineTo(3, 6);
  ctx.lineTo(0, 5);
  ctx.lineTo(-3, 6);
  ctx.lineTo(-8, 5);
  ctx.lineTo(-3, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Title screen overlay, drawn over the parked scene.
export function drawTitle(ctx, W, H, best, time) {
  ctx.fillStyle = 'rgba(8,18,30,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.fillText('SKYLINE COURIER', W / 2, H * 0.3);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('Fly the rings. Mind the fuel. Bring her home.', W / 2, H * 0.3 + 40);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  const lines = [
    'ARROWS / WASD — steer and climb    SHIFT — throttle up    CTRL — throttle down',
    'SPACE — air brake    DRAG with mouse or finger — steer like a stick',
    'Fly through every gold ring, then land on the runway to refuel and score.',
    'Three missions: Ring Run · Island Hop · Storm Courier. Three lives. No fuel, no glory.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.48 + i * 28));
  if (best > 0) {
    ctx.fillStyle = '#9fd8ff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('BEST SCORE  ' + String(best).padStart(6, '0'), W / 2, H * 0.48 + 4 * 28 + 14);
  }
  if (time % 1.2 < 0.8) {
    ctx.fillStyle = '#ffbe3c';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('PRESS ENTER OR CLICK TO FLY', W / 2, H * 0.78);
  }
}

// Pause / crash / game-over overlays.
export function drawOverlay(ctx, W, H, title, sub, hint) {
  ctx.fillStyle = 'rgba(8,18,30,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText(title, W / 2, H * 0.42);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(sub, W / 2, H * 0.42 + 40);
  if (hint) {
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(hint, W / 2, H * 0.42 + 76);
  }
}
