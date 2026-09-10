// aether-fluid :: core/clock.js
// Frame timing, refresh-rate discovery and the adaptive quality governor.

// Quality ladder, best first. Every tier is a complete, self-consistent budget:
// simulation long side, Jacobi sweeps, advection order, bloom, tracer count and
// the device-pixel-ratio the canvas is rendered at.
export const TIERS = [
  { name: 'Ultra', simLong: 512, pressure: 22, order: 2, bloom: true, particles: 12288, dpr: 2.0, crisp: 0.55 },
  { name: 'High', simLong: 448, pressure: 18, order: 2, bloom: true, particles: 8192, dpr: 2.0, crisp: 0.5 },
  { name: 'Balanced', simLong: 384, pressure: 15, order: 2, bloom: true, particles: 6144, dpr: 1.75, crisp: 0.45 },
  { name: 'Lean', simLong: 320, pressure: 12, order: 2, bloom: true, particles: 4096, dpr: 1.5, crisp: 0.35 },
  { name: 'Lite', simLong: 256, pressure: 10, order: 1, bloom: false, particles: 2048, dpr: 1.25, crisp: 0.25 },
  { name: 'Survival', simLong: 192, pressure: 8, order: 1, bloom: false, particles: 0, dpr: 1.0, crisp: 0.0 },
];

const REFRESH_CANDIDATES = [60, 90, 120, 144];

export class FrameClock {
  constructor() {
    this.last = 0;
    this.dt = 0;
    this.emaMs = 16.7;
    this.window = new Float32Array(160);
    this.filled = 0;
    this.cursor = 0;
    this.refreshHz = 60;
    this.samples = 0;
  }

  static now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  tick(now) {
    if (this.last === 0) {
      this.last = now;
      return 0;
    }
    let ms = now - this.last;
    this.last = now;
    if (ms <= 0) ms = 0.01;
    if (ms > 250) ms = 250;
    this.dt = ms / 1000;
    this.emaMs += (ms - this.emaMs) * 0.08;
    this.window[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % this.window.length;
    if (this.filled < this.window.length) this.filled++;
    this.samples++;
    // Re-estimate for the first ~15 seconds, then freeze: a single lucky fast
    // frame later on must not convince us the panel is faster than it is.
    if (this.samples % 20 === 0 && this.samples < 900) this.estimateRefresh();
    return this.dt;
  }

  get fps() {
    return 1000 / Math.max(this.emaMs, 0.001);
  }

  get frameMs() {
    return this.emaMs;
  }

  percentile(p) {
    if (this.filled < 8) return this.emaMs;
    const arr = Array.prototype.slice.call(this.window, 0, this.filled).sort(function (a, b) { return a - b; });
    const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)));
    return arr[idx];
  }

  // Snap a measured vsync period onto the nearest panel rate. A reading just
  // above a candidate (100 Hz vs a 120 Hz panel) is pulled up, because frame
  // jitter only ever makes a delta larger, never smaller.
  setRefreshFromPeriod(ms) {
    if (!isFinite(ms) || ms <= 0) return this.refreshHz;
    const raw = 1000 / ms;
    let best = REFRESH_CANDIDATES[0];
    let bestErr = Infinity;
    for (let i = 0; i < REFRESH_CANDIDATES.length; i++) {
      const candidate = REFRESH_CANDIDATES[i];
      const bias = candidate >= raw ? 0.82 : 1.0;
      const err = Math.abs(candidate - raw) * bias;
      if (err < bestErr) { bestErr = err; best = candidate; }
    }
    this.refreshHz = best;
    return best;
  }

  // Discover the panel refresh rate from the fastest frames we ever produce.
  // Sustained 8.3 ms frames on iPhone 17 Pro ProMotion read as 120 Hz.
  estimateRefresh() {
    const fast = this.percentile(0.08);
    if (!isFinite(fast) || fast <= 0) return;
    if (raw > 150) return;
    this.setRefreshFromPeriod(fast);
  }
}

// Governor: walks the quality ladder to hold the frame budget. Moves down fast
// (a dropped frame is visible) and up slowly, with hysteresis, so it never hunts.
export class Governor {
  constructor(clock) {
    this.clock = clock;
    this.tier = 1;
    this.locked = false;
    this.downCooldown = 0;
    this.upStreak = 0;
    this.upCooldown = 0;
    this.changes = 0;
    this.lastReason = 'init';
  }

  get budgetMs() {
    return 1000 / this.clock.refreshHz;
  }

  lock(tier) {
    this.locked = true;
    this.tier = Math.min(TIERS.length - 1, Math.max(0, tier));
    this.lastReason = 'manual';
    this.changes++;
    return this.tier;
  }

  unlock() {
    this.locked = false;
    this.lastReason = 'auto';
  }

  update(dt) {
    if (this.locked) return -1;
    const budget = this.budgetMs;
    const ema = this.clock.emaMs;
    if (this.downCooldown > 0) this.downCooldown -= dt;
    if (this.upCooldown > 0) this.upCooldown -= dt;

    if (ema > budget * 1.18 && this.downCooldown <= 0 && this.tier < TIERS.length - 1) {
      this.tier++;
      this.downCooldown = 1.4;
      this.upStreak = 0;
      this.upCooldown = 3.5;
      this.changes++;
      this.lastReason = 'over budget';
      return this.tier;
    }

    if (ema < budget * 0.68 && this.upCooldown <= 0 && this.tier > 0) {
      this.upStreak += dt;
      if (this.upStreak > 2.5) {
        this.tier--;
        this.upStreak = 0;
        this.upCooldown = 3.0;
        this.changes++;
        this.lastReason = 'headroom';
        return this.tier;
      }
    } else {
      this.upStreak = 0;
    }
    return -1;
  }
}

export function pickStartTier() {
  if (typeof navigator === 'undefined') return 1;
  const mem = navigator.deviceMemory || 0;
  const cores = navigator.hardwareConcurrency || 0;
  if (mem && mem <= 4) return 3;
  if (cores && cores <= 4) return 3;
  return 1;
}
