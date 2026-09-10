// aether-fluid :: input/pointer.js
// Multi-touch tracking. The module only records positions; the simulation loop
// turns per-frame deltas into velocity impulses, which keeps splat counts low
// and frame-rate independent.

import { clamp } from '../ui/dom.js';

export class PointerInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.pointers = new Map();
    this.serial = 0;
    this.lastActivity = 0;
    this.onFirstTouch = null;
    this._bound = [];
  }

  attach() {
    const canvas = this.canvas;
    const self = this;
    const listen = function (target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      self._bound.push([target, type, fn]);
    };

    const point = function (event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const add = function (id, x, y) {
      const existing = self.pointers.get(id);
      if (existing) { existing.x = x; existing.y = y; return existing; }
      self.serial++;
      const p = {
        id: id,
        x: x,
        y: y,
        lastX: x,
        lastY: y,
        seed: (self.serial * 0.61803398875 + Math.random() * 0.37) % 1,
        phase: Math.random(),
        energy: 1,
        born: performance.now(),
      };
      self.pointers.set(id, p);
      self.lastActivity = performance.now();
      return p;
    };

    const remove = function (id) {
      self.pointers.delete(id);
      self.lastActivity = performance.now();
    };

    const touchFirst = function () {
      if (self.onFirstTouch) self.onFirstTouch();
    };

    listen(canvas, 'pointerdown', function (event) {
      event.preventDefault();
      const q = point(event);
      add(event.pointerId, q.x, q.y);
      try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
      touchFirst();
    }, { passive: false });

    listen(canvas, 'pointermove', function (event) {
      const p = self.pointers.get(event.pointerId);
      if (!p) return;
      event.preventDefault();
      const q = point(event);
      const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null;
      if (samples && samples.length) {
        const last = samples[samples.length - 1];
        const rect = canvas.getBoundingClientRect();
        p.x = last.clientX - rect.left;
        p.y = last.clientY - rect.top;
      } else {
        p.x = q.x;
        p.y = q.y;
      }
      self.lastActivity = performance.now();
    }, { passive: false });

    const end = function (event) { remove(event.pointerId); };
    listen(canvas, 'pointerup', end);
    listen(canvas, 'pointercancel', end);
    listen(window, 'blur', function () { self.pointers.clear(); });

    // Fallback path for engines without PointerEvent.
    if (!('PointerEvent' in window)) {
      listen(canvas, 'touchstart', function (event) {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        for (let i = 0; i < event.changedTouches.length; i++) {
          const t = event.changedTouches[i];
          add(t.identifier, t.clientX - rect.left, t.clientY - rect.top);
        }
        touchFirst();
      }, { passive: false });
      listen(canvas, 'touchmove', function (event) {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        for (let i = 0; i < event.changedTouches.length; i++) {
          const t = event.changedTouches[i];
          const p = self.pointers.get(t.identifier);
          if (p) { p.x = t.clientX - rect.left; p.y = t.clientY - rect.top; }
        }
      }, { passive: false });
      const tend = function (event) {
        for (let i = 0; i < event.changedTouches.length; i++) remove(event.changedTouches[i].identifier);
      };
      listen(canvas, 'touchend', tend);
      listen(canvas, 'touchcancel', tend);
    }

    // iOS rubber-banding and long-press callouts have no place here.
    listen(canvas, 'touchmove', function (e) { e.preventDefault(); }, { passive: false });
    listen(document, 'gesturestart', function (e) { e.preventDefault(); });
    listen(canvas, 'contextmenu', function (e) { e.preventDefault(); });
    return this;
  }

  get count() {
    return this.pointers.size;
  }

  get idleSeconds() {
    if (!this.lastActivity) return 999;
    return (performance.now() - this.lastActivity) / 1000;
  }

  each(fn) {
    this.pointers.forEach(fn);
  }

  // Normalised (0..1) position with the origin at the bottom-left, matching the
  // simulation texture orientation.
  normalized(p, width, height) {
    return { x: clamp(p.x / width, 0, 1), y: clamp(1 - p.y / height, 0, 1) };
  }

  detach() {
    for (let i = 0; i < this._bound.length; i++) {
      const entry = this._bound[i];
      entry[0].removeEventListener(entry[1], entry[2]);
    }
    this._bound.length = 0;
    this.pointers.clear();
  }
}
