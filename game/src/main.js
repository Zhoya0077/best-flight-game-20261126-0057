// Skyline Courier — boot and frame loop.
// One job: size the canvas, build the game, run requestAnimationFrame, and
// hand screenshot mode (?shot=…) a single frozen frame instead of a loop.

import { Game } from './game.js';
import { CONFIG } from './config.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || CONFIG.worldSeed) || CONFIG.worldSeed;
const shot = params.get('shot');

const game = new Game(canvas, seed);
window.__game = game;

function fitCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== w || canvas.height !== h) game.renderer.resize(w, h);
}

if (shot) {
  // Screenshot mode: one deterministic frame, no loop, no audio.
  game.setupShot(shot);
} else {
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
