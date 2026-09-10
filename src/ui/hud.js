// aether-fluid :: ui/hud.js
// Compact performance readout with a frame-time sparkline drawn on a 2D canvas.

import { el } from './dom.js';

const HISTORY = 176;

export class Hud {
  constructor(host) {
    this.host = host;
    this.graph = el('canvas', { class: 'hud-graph', width: HISTORY, height: 38 });
    this.ctx = this.graph.getContext('2d');
    this.fpsNode = el('b', { class: 'hud-v', text: '--' });
    this.msNode = el('b', { class: 'hud-v', text: '--' });
    this.hzNode = el('b', { class: 'hud-v', text: '--' });
    this.gridNode = el('b', { class: 'hud-v', text: '--' });
    this.tierNode = el('b', { class: 'hud-v', text: '--' });
    this.passNode = el('b', { class: 'hud-v', text: '--' });
    this.tracerNode = el('b', { class: 'hud-v', text: '--' });
    this.history = new Float32Array(HISTORY);
    this.cursor = 0;
    this.filled = 0;
    this.tick = 0;

    const cell = function (label, node) {
      return el('div', { class: 'hud-cell' }, [el('span', { class: 'hud-k', text: label }), node]);
    };

    this.root = el('div', { class: 'hud-inner' }, [
      this.graph,
      el('div', { class: 'hud-grid' }, [
        cell('fps', this.fpsNode),
        cell('帧时', this.msNode),
        cell('刷新', this.hzNode),
        cell('网格', this.gridNode),
        cell('画质', this.tierNode),
        cell('通道', this.passNode),
        cell('示踪', this.tracerNode),
      ]),
    ]);
    host.appendChild(this.root);
  }

  setVisible(on) {
    this.host.classList.toggle('is-hidden', !on);
  }

  update(state) {
    this.history[this.cursor] = state.frameMs;
    this.cursor = (this.cursor + 1) % HISTORY;
    if (this.filled < HISTORY) this.filled++;
    this.tick++;
    if (this.tick % 4 !== 0) return;

    this.fpsNode.textContent = state.fps.toFixed(0);
    this.msNode.textContent = state.frameMs.toFixed(1) + ' ms';
    this.hzNode.textContent = state.refreshHz + ' Hz';
    this.gridNode.textContent = state.simW + 'x' + state.simH;
    this.tierNode.textContent = state.tierName + (state.tierLocked ? ' · 锁定' : ' · 自动');
    this.passNode.textContent = state.passes;
    this.tracerNode.textContent = state.tracers > 0 ? (state.tracers / 1024).toFixed(1) + 'k' : '关';
    this.drawGraph(state.budgetMs);
  }

  drawGraph(budgetMs) {
    const ctx = this.ctx;
    const w = HISTORY;
    const h = 38;
    ctx.clearRect(0, 0, w, h);
    const scale = h / (budgetMs * 2.2);

    ctx.strokeStyle = 'rgba(120, 200, 255, 0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - budgetMs * scale);
    ctx.lineTo(w, h - budgetMs * scale);
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < this.filled; i++) {
      const idx = (this.cursor + HISTORY - this.filled + i) % HISTORY;
      const x = i;
      const y = h - Math.min(this.history[idx], h / scale) * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(120, 232, 255, 0.95)');
    gradient.addColorStop(1, 'rgba(255, 110, 210, 0.85)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}
