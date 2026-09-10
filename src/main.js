// aether-fluid :: main.js
// Application shell: context lifecycle, resolution policy, the frame loop and
// every user-facing action. Physics lives in sim/, pixels live in glsl/.

import { createRenderer, describeFailure } from './core/glx.js';
import { createFullscreenTriangle } from './core/quad.js';
import { FrameClock, Governor, TIERS, pickStartTier } from './core/clock.js';
import { Fluid } from './sim/fluid.js';
import { Particles } from './sim/particles.js';
import { defaultParams, PRESETS, findPreset, hsvToRgb } from './sim/presets.js';
import { PointerInput } from './input/pointer.js';
import { MotionInput } from './input/motion.js';
import { Hud } from './ui/hud.js';
import { Panel } from './ui/panel.js';
import { el, clear, clamp, lerp } from './ui/dom.js';

const STORAGE_KEY = 'aether-fluid/state-v1';
const SEED_BATCH = 8;
const DYE_RATE = 0.6;
const HEAT_RATE = 0.6;

class App {
  constructor() {
    this.canvas = document.getElementById('stage');
    this.hudHost = document.getElementById('hud');
    this.dockHost = document.getElementById('dock');
    this.toastHost = document.getElementById('toast');
    this.shotHost = document.getElementById('shot');
    this.fatalHost = document.getElementById('fatal');
    this.installHost = document.getElementById('install');
    this.dockToggle = document.getElementById('dock-toggle');

    this.params = defaultParams();
    this.currentPreset = 'nebula';
    this.tierIndex = pickStartTier();
    this.tier = TIERS[this.tierIndex];
    this.clock = new FrameClock();
    this.governor = new Governor(this.clock);
    this.governor.tier = this.tierIndex;

    this.elapsed = 0;
    this.paused = false;
    this.lost = false;
    this.raf = 0;
    this.drawW = 0;
    this.drawH = 0;
    this.viewW = 0;
    this.viewH = 0;
    this.needAllocate = true;
    this.needMeasure = true;
    this.shotPending = false;
    this.seedPending = 0;
    this.tracerOn = false;
    this.motionOn = false;
    this.hudVisible = true;
    this.saveTimer = 0;
    this.toastTimer = 0;
    this.frames = 0;
  }

  // ---------------------------------------------------------------- lifecycle

  boot() {
    const self = this;
    const created = createRenderer(this.canvas);
    if (!created.ok) {
      this.fail(describeFailure(created.reason));
      return;
    }

    this.buildScene(created.gl, created.caps);
    this.restoreState();

    this.pointer = new PointerInput(this.canvas);
    this.pointer.attach();
    this.pointer.onFirstTouch = function () { self.setDock(false); };

    this.motion = new MotionInput();

    this.hud = new Hud(this.hudHost);
    this.panel = new Panel(this.dockHost, {
      onParam: function (key, value) { self.setParam(key, value); },
      onPreset: function (id) { self.applyPreset(id); },
      onQuality: function (index) { self.setQuality(index); },
      onAction: function (name) { self.runAction(name); },
      onToggleDock: function () { self.setDock(!self.panel.open); },
    });

    this.panel.sync(this.params);
    const preset = findPreset(this.currentPreset);
    this.panel.setPreset(preset.id, preset.blurb);
    this.panel.setQuality(this.governor.tier, this.governor.locked, this.tier.name);

    this.attachEvents();
    this.needMeasure = true;
    this.needAllocate = true;
    this.syncResolution();
    this.seedPending = 12;

    this.renderOnce();
    this.probeRefresh().then(function () {
      self.clock.last = 0;
      self.raf = requestAnimationFrame(function (t) { self.frame(t); });
    });
    this.setupPwa();
    this.maybeShowInstallHint();
    window.__AETHER__ = this;
  }

  buildScene(gl, caps) {
    this.gl = gl;
    this.caps = caps;
    this.quad = createFullscreenTriangle(gl);
    this.fluid = new Fluid(gl, caps, this.quad);
    this.particles = new Particles(gl, caps);
  }

  attachEvents() {
    const self = this;

    const remeasure = function () {
      self.needMeasure = true;
      self.needAllocate = true;
    };
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', remeasure);
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(remeasure);
      this.resizeObserver.observe(this.canvas);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        self.clock.last = 0;
      } else {
        self.clock.last = 0;
        self.needMeasure = true;
        self.needAllocate = true;
      }
    });

    // iOS reclaims the GL context aggressively when the tab is backgrounded.
    this.canvas.addEventListener('webglcontextlost', function (event) {
      event.preventDefault();
      self.lost = true;
      if (self.raf) cancelAnimationFrame(self.raf);
      self.raf = 0;
      self.toast('图形上下文丢失，正在等待恢复…');
    }, false);

    this.canvas.addEventListener('webglcontextrestored', function () {
      self.rebuild();
    }, false);

    window.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = event.key;
      if (key === ' ') { event.preventDefault(); self.runAction('pause'); }
      else if (key === 'r' || key === 'R') self.runAction('reset');
      else if (key === 's' || key === 'S') self.runAction('screenshot');
      else if (key === 'h' || key === 'H') self.setDock(!self.panel.open);
      else if (key === 'm' || key === 'M') self.runAction('hud');
      else if (key >= '1' && key <= '6') {
        const index = parseInt(key, 10) - 1;
        if (index < PRESETS.length) self.applyPreset(PRESETS[index].id);
      }
    });

    if (this.dockToggle) {
      this.dockToggle.addEventListener('click', function () { self.setDock(!self.panel.open); });
    }
  }

  rebuild() {
    const self = this;
    try {
      if (this.fluid) this.fluid.dispose();
      if (this.particles) this.particles.dispose();
      if (this.quad) this.quad.dispose();
    } catch (err) { /* the old context is gone; deletions are best effort */ }

    const created = createRenderer(this.canvas);
    if (!created.ok) {
      this.fail(describeFailure(created.reason));
      return;
    }
    this.lost = false;
    this.buildScene(created.gl, created.caps);
    this.needMeasure = true;
    this.needAllocate = true;
    this.syncResolution();
    this.seedPending = 8;
    this.clock.last = 0;
    this.toast('已恢复');
    if (!this.raf) this.raf = requestAnimationFrame(function (t) { self.frame(t); });
  }

  fail(message) {
    const host = this.fatalHost;
    if (!host) return;
    clear(host);
    host.appendChild(el('div', { class: 'fatal-card' }, [
      el('h2', { text: '无法启动' }),
      el('p', { text: message }),
      el('p', { class: 'fatal-hint', text: '提示：iOS 需要 15 及以上版本；桌面端请确认浏览器未禁用硬件加速。' }),
    ]));
    host.hidden = false;
  }

  // ------------------------------------------------------------- resolution

  syncResolution() {
    if (!this.needMeasure && !this.needAllocate) return;
    const rect = this.canvas.getBoundingClientRect();
    const viewW = Math.max(1, Math.round(rect.width || window.innerWidth || 1));
    const viewH = Math.max(1, Math.round(rect.height || window.innerHeight || 1));
    const dpr = this.tier.dpr;
    const w = Math.max(32, Math.round(viewW * dpr));
    const h = Math.max(32, Math.round(viewH * dpr));

    this.viewW = viewW;
    this.viewH = viewH;

    const bufferChanged = w !== this.drawW || h !== this.drawH;
    if (bufferChanged) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.drawW = w;
      this.drawH = h;
    }

    if (bufferChanged || this.needAllocate || !this.fluid.simW) {
      this.fluid.allocate(this.drawW, this.drawH, this.tier.simLong, this.tier.bloom);
      const want = (this.params.particles && this.tier.particles > 0) ? this.tier.particles : 0;
      this.particles.allocate(want);
      this.tracerOn = want > 0;
    }
    this.needMeasure = false;
    this.needAllocate = false;
  }

  applyTier(index) {
    this.tierIndex = clamp(index, 0, TIERS.length - 1);
    this.tier = TIERS[this.tierIndex];
    this.params.pressure = this.tier.pressure;
    this.params.order = this.tier.order;
    this.params.crisp = this.tier.crisp;
    this.needMeasure = true;
    this.needAllocate = true;
    if (this.panel) {
      this.panel.sync(this.params);
      this.panel.setQuality(this.tierIndex, this.governor.locked, this.tier.name);
    }
  }

  // -------------------------------------------------------------- warm-up

  // One synchronous frame so the screen is never empty while we measure.
  renderOnce() {
    const p = this.params;
    p.time += 1 / 60;
    this.emitSplats(1 / 60);
    this.fluid.step(1 / 60, p);
    if (this.tracerOn) this.particles.step(1 / 60, this.fluid.velocity.read.texture, p, this.fluid.aspect);
    this.fluid.render(p, this.drawW, this.drawH);
    if (this.tracerOn) this.particles.draw(p, this.tier.dpr);
  }

  // Measure the display cadence with an empty animation loop. Rendering nothing
  // means every delta is a pure vsync period, which is the only trustworthy way
  // to learn that an iPhone 17 Pro ProMotion panel is running at 120 Hz.
  probeRefresh() {
    const self = this;
    return new Promise(function (resolve) {
      const deltas = [];
      let last = 0;
      let count = 0;
      const step = function (now) {
        if (last) deltas.push(now - last);
        last = now;
        count++;
        if (count < 22) {
          requestAnimationFrame(step);
          return;
        }
        deltas.sort(function (a, b) { return a - b; });
        const median = deltas[Math.floor(deltas.length / 2)];
        self.clock.setRefreshFromPeriod(median);
        resolve(self.clock.refreshHz);
      };
      requestAnimationFrame(step);
    });
  }

  // ------------------------------------------------------------------- loop

  frame(now) {
    const self = this;
    this.raf = requestAnimationFrame(function (t) { self.frame(t); });
    if (this.lost) return;

    const dt = this.clock.tick(now);
    if (document.hidden) return;

    const moved = this.governor.update(dt);
    if (moved >= 0 && moved !== this.tierIndex) {
      this.applyTier(moved);
      this.panel.setQuality(this.tierIndex, false, this.tier.name + ' · ' + this.governor.lastReason);
    } else if (this.frames % 120 === 0 && !this.governor.locked) {
      this.panel.setQuality(this.tierIndex, false, this.tier.name + ' · ' + this.governor.lastReason);
    }

    this.syncResolution();
    this.frames++;

    const p = this.params;
    this.elapsed += dt;
    p.time += dt;

    this.motion.update(dt, this.fluid.gravity);
    this.emitSplats(dt);

    const simDt = clamp(dt, 1 / 240, 1 / 30);
    this.fluid.triangles = 0;
    if (!this.paused) {
      this.fluid.step(simDt, p);
      if (this.tracerOn) this.particles.step(simDt, this.fluid.velocity.read.texture, p, this.fluid.aspect);
    } else {
      this.fluid.beginSplats();
    }

    this.fluid.render(p, this.drawW, this.drawH);
    if (this.tracerOn) this.particles.draw(p, this.tier.dpr);

    if (this.shotPending) {
      this.shotPending = false;
      this.capture();
    }

    if (this.hudVisible) {
      this.hud.update({
        frameMs: this.clock.frameMs,
        fps: this.clock.fps,
        refreshHz: this.clock.refreshHz,
        budgetMs: this.governor.budgetMs,
        simW: this.fluid.simW,
        simH: this.fluid.simH,
        tierName: this.tier.name,
        tierLocked: this.governor.locked,
        passes: this.fluid.triangles,
        tracers: this.tracerOn ? this.particles.count : 0,
      });
    }
  }

  // ---------------------------------------------------------------- injection

  emitSplats(dt) {
    const p = this.params;
    const fluid = this.fluid;
    const W = Math.max(1, this.viewW);
    const H = Math.max(1, this.viewH);
    const dtSafe = clamp(dt, 1 / 240, 1 / 20);
    const dyeStep = p.dyeAmount * DYE_RATE * dtSafe;
    const heatStep = p.heatAmount * HEAT_RATE * dtSafe;

    fluid.beginSplats();

    if (this.seedPending > 0) {
      const batch = Math.min(SEED_BATCH, this.seedPending);
      this.seedPending -= batch;
      for (let i = 0; i < batch; i++) this.spawnSeed();
    }

    const idle = this.pointer.count === 0 && this.pointer.idleSeconds > 4;
    p.stirActive = (idle && !this.paused) ? p.stir : 0;
    if (p.stirActive > 0) this.spawnAmbient(dtSafe);

    this.pointer.each((ptr) => {
      const dx = ptr.x - ptr.lastX;
      const dy = ptr.y - ptr.lastY;
      ptr.lastX = ptr.x;
      ptr.lastY = ptr.y;
      ptr.phase = (ptr.phase + dtSafe * 0.5) % 1;

      const nx = clamp(ptr.x / W, 0, 1);
      const ny = clamp(1 - ptr.y / H, 0, 1);

      const rawVx = (dx / H) / dtSafe;
      const rawVy = (-dy / H) / dtSafe;
      const gain = p.splatGain;
      let vx = p.maxSpeed * Math.tanh((rawVx * gain) / p.maxSpeed);
      let vy = p.maxSpeed * Math.tanh((rawVy * gain) / p.maxSpeed);

      // A finger resting on the glass still stirs a little, and still paints.
      if (Math.abs(rawVx) + Math.abs(rawVy) < 1) {
        const angle = ptr.phase * Math.PI * 2;
        vx += Math.cos(angle) * 0.14;
        vy += Math.sin(angle) * 0.14;
      }

      fluid.addForce(nx, ny, p.splatRadius, 1, vx, vy);

      const hue = lerp(p.palette.h0, p.palette.h1, (ptr.seed + this.elapsed * 0.05) % 1);
      const rgb = hsvToRgb(hue, p.palette.sat, p.palette.val);
      fluid.addDye(nx, ny, p.splatRadius * 1.35, 1,
        rgb[0] * dyeStep, rgb[1] * dyeStep, rgb[2] * dyeStep, heatStep);
    });
  }

  spawnSeed() {
    const p = this.params;
    const x = 0.14 + Math.random() * 0.72;
    const y = 0.14 + Math.random() * 0.72;
    const angle = Math.random() * Math.PI * 2;
    const speed = p.maxSpeed * (0.35 + Math.random() * 0.5);
    this.fluid.addForce(x, y, p.splatRadius * (1.3 + Math.random()), 1,
      Math.cos(angle) * speed, Math.sin(angle) * speed);
    const hue = lerp(p.palette.h0, p.palette.h1, Math.random());
    const rgb = hsvToRgb(hue, p.palette.sat, p.palette.val);
    const amount = p.dyeAmount * (0.9 + Math.random() * 0.8);
    this.fluid.addDye(x, y, p.splatRadius * (1.6 + Math.random() * 0.9), 1,
      rgb[0] * amount, rgb[1] * amount, rgb[2] * amount, p.heatAmount * 0.9);
  }

  spawnAmbient(dtSafe) {
    const p = this.params;
    const t = this.elapsed;
    const c1x = 0.5 - 0.27 * Math.cos(t * 0.31);
    const c1y = 0.5 + 0.21 * Math.sin(t * 0.23);
    const c2x = 0.5 + 0.25 * Math.cos(t * 0.19 + 2.1);
    const c2y = 0.5 - 0.23 * Math.sin(t * 0.27 + 1.3);
    const span = p.palette.h1 - p.palette.h0;
    const a = hsvToRgb(p.palette.h0 + span * ((t * 0.05) % 1), p.palette.sat, p.palette.val);
    const b = hsvToRgb(p.palette.h0 + span * ((t * 0.05 + 0.5) % 1), p.palette.sat, p.palette.val);
    const step = p.stirActive * dtSafe * 0.30;
    const radius = p.splatRadius * 1.6;
    const heat = p.heatAmount * dtSafe * 0.05;
    this.fluid.addDye(c1x, c1y, radius, 1, a[0] * step, a[1] * step, a[2] * step, heat);
    this.fluid.addDye(c2x, c2y, radius, 1, b[0] * step, b[1] * step, b[2] * step, heat);
  }

  // ------------------------------------------------------------------ params

  setParam(key, value) {
    this.params[key] = value;
    if (key === 'particles') this.needAllocate = true;
    if (key === 'stir') this.params.stirActive = 0;
    this.saveSoon();
  }

  applyPreset(id) {
    const preset = findPreset(id);
    const next = defaultParams();
    Object.assign(next, preset.params);
    next.motionOn = this.motionOn;
    this.params = next;
    this.currentPreset = preset.id;
    if (this.fluid) {
      this.fluid.gravity[0] = 0;
      this.fluid.gravity[1] = 0;
    }
    this.needAllocate = true;
    this.needMeasure = true;

    if (typeof preset.tierLock === 'number') {
      this.governor.lock(preset.tierLock);
      this.applyTier(preset.tierLock);
    } else {
      this.governor.unlock();
      this.applyTier(this.governor.tier);
    }

    this.panel.sync(this.params);
    this.panel.setPreset(preset.id, preset.blurb);
    this.seedPending = 12;
    this.saveSoon();
  }

  setQuality(index) {
    if (index < 0) {
      this.governor.unlock();
      this.panel.setQuality(this.tierIndex, false, this.tier.name + ' · 自动');
      this.toast('画质：自动调节');
    } else {
      this.governor.lock(index);
      this.applyTier(index);
      this.toast('画质已锁定：' + TIERS[index].name);
    }
    this.saveSoon();
  }

  runAction(name) {
    if (name === 'reset') {
      this.fluid.reset();
      this.seedPending = 14;
      this.toast('已重置');
    } else if (name === 'clear') {
      this.fluid.reset();
      this.seedPending = 0;
      this.toast('已清空');
    } else if (name === 'screenshot') {
      this.shotPending = true;
    } else if (name === 'pause') {
      this.paused = !this.paused;
      this.toast(this.paused ? '已暂停' : '继续');
    } else if (name === 'motion') {
      this.toggleMotion();
    } else if (name === 'hud') {
      this.hudVisible = !this.hudVisible;
      this.hud.setVisible(this.hudVisible);
      this.panel.setActionState('hud', !this.hudVisible);
    }
  }

  async toggleMotion() {
    if (this.motionOn) {
      this.motion.stop();
      this.motionOn = false;
      this.panel.setActionState('motion', false);
      this.toast('体感重力已关闭');
      return;
    }
    const verdict = await this.motion.request();
    if (!verdict.ok) {
      this.motionOn = false;
      this.panel.setActionState('motion', false);
      this.toast(verdict.reason === 'denied' ? '未获得运动传感器权限' : '此设备不支持体感');
      return;
    }
    this.motionOn = true;
    this.panel.setActionState('motion', true);
    this.toast('体感重力已开启，倾斜手机试试');
  }

  setDock(on) {
    if (!this.panel) return;
    this.panel.setOpen(on);
    if (this.dockToggle) this.dockToggle.classList.toggle('is-active', on);
  }

  // -------------------------------------------------------------- feedback

  toast(message) {
    const host = this.toastHost;
    if (!host) return;
    host.textContent = message;
    host.classList.add('is-on');
    clearTimeout(this.toastTimer);
    const self = this;
    this.toastTimer = setTimeout(function () {
      host.classList.remove('is-on');
    }, 1800);
    void self;
  }

  capture() {
    const self = this;
    try {
      this.canvas.toBlob(function (blob) {
        if (!blob) {
          self.toast('截图失败：浏览器没有返回图像');
          return;
        }
        self.showShot(URL.createObjectURL(blob));
      }, 'image/png');
    } catch (err) {
      this.toast('截图失败：' + (err && err.message ? err.message : '未知错误'));
    }
  }

  showShot(url) {
    const host = this.shotHost;
    if (!host) return;
    clear(host);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const image = el('img', { class: 'shot-img', src: url, alt: '流体截图' });
    const close = el('button', {
      class: 'chip',
      type: 'button',
      text: '关闭',
      onclick: function () {
        host.hidden = true;
        clear(host);
        URL.revokeObjectURL(url);
      },
    });
    const download = el('a', {
      class: 'chip',
      href: url,
      download: 'aether-fluid-' + stamp + '.png',
      text: '下载 PNG',
    });
    host.appendChild(el('div', { class: 'shot-card' }, [
      image,
      el('p', { class: 'shot-hint', text: 'iPhone 上长按图片即可存入相册。' }),
      el('div', { class: 'shot-row' }, [download, close]),
    ]));
    host.hidden = false;
  }

  // ------------------------------------------------------------ persistence

  saveSoon() {
    const self = this;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(function () { self.save(); }, 400);
  }

  save() {
    try {
      const snapshot = {};
      const source = this.params;
      for (const key in source) {
        if (key === 'time' || key === 'stirActive') continue;
        snapshot[key] = source[key];
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        preset: this.currentPreset,
        tier: this.governor.tier,
        locked: this.governor.locked,
        params: snapshot,
      }));
    } catch (err) { /* private mode, quota, or disabled storage */ }
  }

  restoreState() {
    let saved = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (err) {
      saved = null;
    }
    if (!saved || !saved.params) return;
    const base = defaultParams();
    for (const key in saved.params) {
      if (key in base) base[key] = saved.params[key];
    }
    this.params = base;
    if (saved.preset && findPreset(saved.preset).id === saved.preset) this.currentPreset = saved.preset;
    if (typeof saved.tier === 'number') {
      this.governor.tier = clamp(saved.tier, 0, TIERS.length - 1);
      if (saved.locked) this.governor.lock(this.governor.tier);
    }
    this.tierIndex = this.governor.tier;
    this.tier = TIERS[this.tierIndex];
  }

  // -------------------------------------------------------------------- pwa

  setupPwa() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* offline caching is optional */ });
    });
  }

  maybeShowInstallHint() {
    const host = this.installHost;
    if (!host) return;
    const ua = navigator.userAgent || '';
    const isIos = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
    const standalone = window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    let dismissed = false;
    try { dismissed = window.localStorage.getItem(STORAGE_KEY + '/hint') === '1'; } catch (err) { dismissed = false; }
    if (!isIos || standalone || dismissed) return;

    const close = el('button', {
      class: 'install-close',
      type: 'button',
      text: '不再提示',
      onclick: function () {
        host.hidden = true;
        try { window.localStorage.setItem(STORAGE_KEY + '/hint', '1'); } catch (err) { /* ignore */ }
      },
    });
    host.appendChild(el('p', { text: '点 分享 → 添加到主屏幕，即可全屏离线运行，并隐藏 Safari 工具栏。' }));
    host.appendChild(close);
    host.hidden = false;
  }

  // ------------------------------------------------------------- diagnostics

  diagnostics() {
    return {
      ok: !!this.fluid,
      renderer: this.caps ? this.caps.renderer : null,
      format: this.caps ? this.caps.format.name : null,
      sim: this.fluid ? this.fluid.simW + 'x' + this.fluid.simH : null,
      drawBuffer: this.drawW + 'x' + this.drawH,
      view: this.viewW + 'x' + this.viewH,
      tier: this.tier.name,
      locked: this.governor.locked,
      refreshHz: this.clock.refreshHz,
      fps: Math.round(this.clock.fps),
      frameMs: Number(this.clock.frameMs.toFixed(2)),
      passes: this.fluid ? this.fluid.triangles : 0,
      tracers: this.tracerOn ? this.particles.count : 0,
      preset: this.currentPreset,
      paused: this.paused,
      lost: this.lost,
      frames: this.frames,
    };
  }
}

const app = new App();
window.addEventListener('error', function (event) {
  if (window.__AETHER__ && window.__AETHER__.fatalHost && !window.__AETHER__.fluid) {
    window.__AETHER__.fail('初始化过程中出现脚本错误：' + (event.message || 'unknown'));
  }
});

try {
  app.boot();
} catch (err) {
  app.fail('初始化失败：' + (err && err.message ? err.message : String(err)));
}

export default app;
