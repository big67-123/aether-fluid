// aether-fluid :: input/motion.js
// Device tilt -> a real gravity term in the solver, so the fluid falls toward
// whichever edge of the phone is pointing down.
//
// Sign convention: the accelerometer reports proper acceleration, which at rest
// equals -g expressed in device coordinates. Screen "down" is -y_device, so
//   screenDown = +a.y      screenRight = -a.x
// and world gravity (texture space, y up) is therefore (-a.x, -a.y) * gain.

export class MotionInput {
  constructor() {
    this.enabled = false;
    this.hasData = false;
    this.raw = [0, 0];
    this.filtered = [0, 0];
    this.gain = 0.18;
    this.supported = typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
    this.permissionPrompted = false;
    this._handler = null;
  }

  static needsPermission() {
    return typeof window !== 'undefined' &&
      'DeviceMotionEvent' in window &&
      typeof window.DeviceMotionEvent.requestPermission === 'function';
  }

  async request() {
    if (!this.supported) return { ok: false, reason: 'unsupported' };
    if (MotionInput.needsPermission()) {
      try {
        const verdict = await window.DeviceMotionEvent.requestPermission();
        if (verdict !== 'granted') return { ok: false, reason: 'denied' };
      } catch (err) {
        return { ok: false, reason: 'denied' };
      }
    }
    this.start();
    return { ok: true };
  }

  start() {
    if (this.enabled) return;
    const self = this;
    this._handler = function (event) {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null) return;
      const gx = -a.x * 0.1019716;
      const gy = -a.y * 0.1019716;
      self.raw[0] = gx;
      self.raw[1] = gy;
      self.hasData = true;
    };
    window.addEventListener('devicemotion', this._handler, { passive: true });
    this.enabled = true;
  }

  stop() {
    if (this._handler) window.removeEventListener('devicemotion', this._handler);
    this._handler = null;
    this.enabled = false;
    this.hasData = false;
    this.raw[0] = 0;
    this.raw[1] = 0;
    this.filtered[0] = 0;
    this.filtered[1] = 0;
  }

  // Low-pass so hand tremor does not become fluid noise, while deliberate tilts
  // come through with a ~120 ms lag. `raw` is already in units of g.
  update(dt, out) {
    const live = this.enabled && this.hasData;
    const targetX = live ? this.raw[0] : 0;
    const targetY = live ? this.raw[1] : 0;
    const k = Math.min(1, dt / 0.12);
    this.filtered[0] += (targetX - this.filtered[0]) * k;
    this.filtered[1] += (targetY - this.filtered[1]) * k;
    const scale = this.gain * 9.81;
    out[0] = this.filtered[0] * scale;
    out[1] = this.filtered[1] * scale;
    return out;
  }
}
