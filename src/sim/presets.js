// aether-fluid :: sim/presets.js
// One source of truth for every tunable, plus six curated starting points.

export function defaultParams() {
  return {
    // --- solver ---
    curl: 26,
    buoyancy: 1.6,
    weight: 0.0,
    damping: 0.30,
    dyeFade: 0.18,
    heatCool: 0.85,
    pressure: 16,
    pressureDamp: 0.55,
    order: 2,
    maxSpeed: 3.2,

    // --- injection ---
    splatRadius: 0.030,
    splatGain: 0.16,
    dyeAmount: 0.85,
    heatAmount: 1.5,
    stir: 0.30,

    // --- presentation ---
    exposure: 1.35,
    bloom: 0.85,
    bloomThreshold: 0.55,
    crisp: 0.5,
    vignette: 0.30,
    grain: 0.010,
    absorb: 2.4,
    gamma: 2.2,
    blend: 0,
    tonemap: 1,
    base: [0.012, 0.014, 0.022],
    baseTop: [0.004, 0.005, 0.011],

    // --- tracers ---
    particles: true,
    particleOpacity: 0.5,
    particleSpeed: 1.0,
    particleLife: 5.5,
    particleSize: 2.0,
    tintA: [0.35, 0.75, 1.0],
    tintB: [1.0, 0.45, 0.9],

    // --- dye palette for pointer injection ---
    palette: { h0: 0.50, h1: 0.92, sat: 0.85, val: 1.0 },

    time: 0,
  };
}

export const PRESETS = [
  {
    id: 'nebula',
    name: '星云',
    blurb: '默认档。冷色底 + 全彩染料，泛光拉满，粒子示踪最活跃。',
    params: {
      curl: 26, buoyancy: 1.6, weight: 0.0, damping: 0.30, dyeFade: 0.18, heatCool: 0.85,
      pressure: 16, order: 2, splatRadius: 0.030, splatGain: 0.16, dyeAmount: 0.85, heatAmount: 1.5,
      exposure: 1.35, bloom: 0.90, bloomThreshold: 0.55, crisp: 0.5, vignette: 0.30, grain: 0.010,
      blend: 0, tonemap: 1, base: [0.012, 0.014, 0.022], baseTop: [0.004, 0.005, 0.011],
      particles: true, particleOpacity: 0.50, particleSize: 2.0, particleSpeed: 1.0, particleLife: 5.5,
      tintA: [0.35, 0.75, 1.0], tintB: [1.0, 0.45, 0.9],
      palette: { h0: 0.50, h1: 0.92, sat: 0.85, val: 1.0 },
    },
  },
  {
    id: 'ink',
    name: '水墨',
    blurb: '宣纸底 + 吸光式颜料混合，涡度最高，墨水几乎不消散。',
    params: {
      curl: 36, buoyancy: 0.10, weight: 0.05, damping: 0.52, dyeFade: 0.045, heatCool: 1.6,
      pressure: 20, order: 2, splatRadius: 0.026, splatGain: 0.13, dyeAmount: 1.15, heatAmount: 0.25,
      exposure: 1.0, bloom: 0.0, bloomThreshold: 1.0, crisp: 0.6, vignette: 0.05, grain: 0.020,
      absorb: 2.8, blend: 1, tonemap: 0, gamma: 2.2,
      base: [0.930, 0.912, 0.868], baseTop: [0.878, 0.870, 0.842],
      particles: true, particleOpacity: 0.22, particleSize: 1.6, particleSpeed: 1.0, particleLife: 4.0,
      tintA: [0.25, 0.28, 0.36], tintB: [0.10, 0.12, 0.18],
      palette: { h0: 0.55, h1: 0.68, sat: 0.62, val: 0.22 },
    },
  },
  {
    id: 'lava',
    name: '熔岩',
    blurb: '强浮力 + 快速降温，热羽流翻滚上升，暴露高光溢出。',
    params: {
      curl: 18, buoyancy: 4.2, weight: 0.0, damping: 0.40, dyeFade: 0.62, heatCool: 1.9,
      pressure: 16, order: 2, splatRadius: 0.034, splatGain: 0.22, dyeAmount: 1.0, heatAmount: 2.6,
      exposure: 1.15, bloom: 1.15, bloomThreshold: 0.42, crisp: 0.45, vignette: 0.42, grain: 0.012,
      blend: 0, tonemap: 1, base: [0.030, 0.012, 0.006], baseTop: [0.008, 0.004, 0.003],
      particles: true, particleOpacity: 0.62, particleSize: 2.2, particleSpeed: 1.0, particleLife: 3.2,
      tintA: [1.0, 0.72, 0.18], tintB: [1.0, 0.22, 0.05],
      palette: { h0: 0.02, h1: 0.13, sat: 0.95, val: 1.0 },
    },
  },
  {
    id: 'smoke',
    name: '烟',
    blurb: '低饱和染料 + 负重量，像香烟在暗室里被光切开。',
    params: {
      curl: 14, buoyancy: 2.8, weight: -0.10, damping: 0.22, dyeFade: 0.30, heatCool: 1.1,
      pressure: 18, order: 2, splatRadius: 0.042, splatGain: 0.12, dyeAmount: 0.55, heatAmount: 2.0,
      exposure: 1.55, bloom: 0.60, bloomThreshold: 0.60, crisp: 0.35, vignette: 0.36, grain: 0.014,
      blend: 0, tonemap: 1, base: [0.016, 0.018, 0.024], baseTop: [0.006, 0.007, 0.012],
      particles: true, particleOpacity: 0.30, particleSize: 1.8, particleSpeed: 1.0, particleLife: 6.5,
      tintA: [0.62, 0.70, 0.82], tintB: [0.95, 0.86, 0.72],
      palette: { h0: 0.08, h1: 0.60, sat: 0.10, val: 0.85 },
    },
  },
  {
    id: 'neon',
    name: '霓虹',
    blurb: '青紫双色 + 极低阻尼，涡线拉成发光的细丝。',
    params: {
      curl: 48, buoyancy: 0.9, weight: 0.0, damping: 0.12, dyeFade: 0.26, heatCool: 1.2,
      pressure: 20, order: 2, splatRadius: 0.020, splatGain: 0.26, dyeAmount: 0.95, heatAmount: 1.2,
      exposure: 1.25, bloom: 1.35, bloomThreshold: 0.35, crisp: 0.55, vignette: 0.38, grain: 0.008,
      blend: 0, tonemap: 1, base: [0.010, 0.008, 0.024], baseTop: [0.004, 0.003, 0.014],
      particles: true, particleOpacity: 0.75, particleSize: 2.4, particleSpeed: 1.15, particleLife: 4.5,
      tintA: [0.25, 1.0, 0.95], tintB: [0.85, 0.30, 1.0],
      palette: { h0: 0.46, h1: 0.80, sat: 1.0, val: 1.0 },
    },
  },
  {
    id: 'turbo',
    name: '极速',
    blurb: '锁最低画质档，关粒子关泛光，把每一毫秒都还给 120Hz。',
    tierLock: 5,
    params: {
      curl: 22, buoyancy: 1.4, weight: 0.0, damping: 0.40, dyeFade: 0.55, heatCool: 1.3,
      pressure: 8, order: 1, splatRadius: 0.034, splatGain: 0.20, dyeAmount: 1.0, heatAmount: 1.0,
      exposure: 1.30, bloom: 0.0, crisp: 0.0, vignette: 0.20, grain: 0.0, stir: 0.45,
      blend: 0, tonemap: 1, particles: false,
      base: [0.014, 0.016, 0.026], baseTop: [0.005, 0.006, 0.013],
      palette: { h0: 0.48, h1: 0.95, sat: 0.90, val: 1.0 },
    },
  },
];

export function findPreset(id) {
  for (let i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
  return PRESETS[0];
}

export function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
