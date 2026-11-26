// Skyline Courier — keyboard, mouse and touch input.
// One job: turn physical input into a single steering state the plane reads.
// Arrow keys / WASD fly, Shift/Ctrl work the throttle, Space is the brake,
// pointer drag steers the same way a stick would, Enter starts, R restarts.

import { clamp } from './config.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pitch = 0; // -1 (climb) .. 1 (descend), from keys or drag
    this.roll = 0; // -1 (left) .. 1 (right)
    this.throttleUp = false;
    this.throttleDown = false;
    this.brake = false;
    this.dragging = false;
    this.dragDX = 0;
    this.dragDY = 0;
    this.onStart = null; // called on Enter / click when the game asks
    this.onRestart = null;
    this.onPause = null;
    this.onMute = null;
    this._dragStartX = 0;
    this._dragStartY = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Enter' && this.onStart) this.onStart();
      if (e.code === 'KeyR' && this.onRestart) this.onRestart();
      if (e.code === 'KeyP' && this.onPause) this.onPause();
      if (e.code === 'KeyM' && this.onMute) this.onMute();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      this.dragDX = 0;
      this.dragDY = 0;
      canvas.setPointerCapture(e.pointerId);
      if (this.onStart) this.onStart();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.dragDX = clamp((e.clientX - this._dragStartX) / 160, -1, 1);
      this.dragDY = clamp((e.clientY - this._dragStartY) / 160, -1, 1);
    });
    const endDrag = () => {
      this.dragging = false;
      this.dragDX = 0;
      this.dragDY = 0;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  }

  // Read the current steering intent once per frame.
  update() {
    const k = this.keys;
    const left = k.has('ArrowLeft') || k.has('KeyA');
    const right = k.has('ArrowRight') || k.has('KeyD');
    const up = k.has('ArrowUp') || k.has('KeyW');
    const down = k.has('ArrowDown') || k.has('KeyS');
    let roll = (right ? 1 : 0) - (left ? 1 : 0);
    let pitch = (down ? 1 : 0) - (up ? 1 : 0);
    if (this.dragging) {
      roll = this.dragDX;
      pitch = this.dragDY;
    }
    this.roll = clamp(roll, -1, 1);
    this.pitch = clamp(pitch, -1, 1);
    this.throttleUp = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Equal');
    this.throttleDown = k.has('ControlLeft') || k.has('ControlRight') || k.has('Minus');
    this.brake = k.has('Space');
  }
}
