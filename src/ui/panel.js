// aether-fluid :: ui/panel.js
// Declarative control dock. Every control writes straight into the shared params
// object; nothing here knows about WebGL.

import { el, clear } from './dom.js';
import { TIERS } from '../core/clock.js';
import { PRESETS } from '../sim/presets.js';

export const GROUPS = [
  {
    title: '流体',
    items: [
      { key: 'curl', label: '涡度增强', min: 0, max: 60, step: 1, digits: 0 },
      { key: 'buoyancy', label: '热浮力', min: -2, max: 6, step: 0.05, digits: 2 },
      { key: 'weight', label: '染料自重', min: -0.3, max: 0.3, step: 0.005, digits: 3 },
      { key: 'damping', label: '速度耗散', min: 0, max: 1.5, step: 0.01, digits: 2 },
      { key: 'dyeFade', label: '染料消散', min: 0, max: 1.5, step: 0.01, digits: 2 },
      { key: 'heatCool', label: '热量流失', min: 0, max: 3, step: 0.02, digits: 2 },
      { key: 'pressureDamp', label: '压力衰减', min: 0, max: 3, step: 0.02, digits: 2 },
      { key: 'maxSpeed', label: '速度上限', min: 0.5, max: 6, step: 0.05, digits: 2 },
    ],
  },
  {
    title: '注入',
    items: [
      { key: 'splatRadius', label: '笔头半径', min: 0.008, max: 0.09, step: 0.001, digits: 3 },
      { key: 'splatGain', label: '注入力度', min: 0.03, max: 0.6, step: 0.005, digits: 3 },
      { key: 'dyeAmount', label: '染料浓度', min: 0.1, max: 2, step: 0.01, digits: 2 },
      { key: 'heatAmount', label: '注入热量', min: 0, max: 4, step: 0.02, digits: 2 },
      { key: 'stir', label: '静置自动搅动', min: 0, max: 1.2, step: 0.01, digits: 2 },
    ],
  },
  {
    title: '画面',
    items: [
      { key: 'exposure', label: '曝光', min: 0.2, max: 3, step: 0.01, digits: 2 },
      { key: 'bloom', label: '泛光强度', min: 0, max: 2, step: 0.01, digits: 2 },
      { key: 'bloomThreshold', label: '泛光阈值', min: 0.1, max: 1.5, step: 0.01, digits: 2 },
      { key: 'crisp', label: '细节锐化', min: 0, max: 1, step: 0.01, digits: 2 },
      { key: 'vignette', label: '暗角', min: 0, max: 0.8, step: 0.01, digits: 2 },
      { key: 'grain', label: '胶片颗粒', min: 0, max: 0.05, step: 0.001, digits: 3 },
      { key: 'absorb', label: '颜料吸光', min: 0.2, max: 6, step: 0.02, digits: 2 },
      {
        key: 'blend', label: '混合模式', type: 'seg', digits: 0,
        options: [{ label: '发光', value: 0 }, { label: '颜料', value: 1 }],
      },
      {
        key: 'tonemap', label: '色调映射', type: 'seg', digits: 0,
        options: [{ label: 'ACES', value: 1 }, { label: '线性', value: 0 }],
      },
    ],
  },
  {
    title: '示踪粒子',
    items: [
      { key: 'particles', label: '启用粒子层', type: 'switch' },
      { key: 'particleOpacity', label: '不透明度', min: 0, max: 1.2, step: 0.01, digits: 2 },
      { key: 'particleSize', label: '粒子尺寸', min: 1, max: 6, step: 0.1, digits: 1 },
      { key: 'particleSpeed', label: '跟随速度', min: 0, max: 2.5, step: 0.01, digits: 2 },
      { key: 'particleLife', label: '存活寿命', min: 1, max: 12, step: 0.1, digits: 1 },
    ],
  },
];

export class Panel {
  constructor(host, handlers) {
    this.host = host;
    this.handlers = handlers;
    this.rows = new Map();
    this.presetNodes = new Map();
    this.qualityNodes = [];
    this.actionNodes = new Map();
    this.open = false;
    this.build();
  }

  build() {
    const self = this;
    clear(this.host);

    const grip = el('button', { class: 'dock-grip', type: 'button', 'aria-label': '展开或收起控制面板' });
    grip.appendChild(el('span', { class: 'dock-grip-bar' }));
    grip.addEventListener('click', function () {
      if (self.handlers.onToggleDock) self.handlers.onToggleDock();
    });
    this.grip = grip;
    this.host.appendChild(grip);

    const presetRow = el('div', { class: 'chip-row' });
    for (let i = 0; i < PRESETS.length; i++) {
      const preset = PRESETS[i];
      const chip = el('button', {
        class: 'chip',
        type: 'button',
        text: preset.name,
        title: preset.blurb,
        onclick: (function (id) {
          return function () { self.handlers.onPreset(id); };
        })(preset.id),
      });
      this.presetNodes.set(preset.id, chip);
      presetRow.appendChild(chip);
    }
    this.host.appendChild(el('section', { class: 'dock-section' }, [
      el('h3', { class: 'dock-h', text: '预设' }),
      presetRow,
      el('p', { class: 'dock-blurb', id: 'preset-blurb' }),
    ]));

    const qualityRow = el('div', { class: 'chip-row' });
    const autoChip = el('button', {
      class: 'chip chip-quiet',
      type: 'button',
      text: '自动',
      onclick: function () { self.handlers.onQuality(-1); },
    });
    this.qualityNodes.push(autoChip);
    qualityRow.appendChild(autoChip);
    for (let i = 0; i < TIERS.length; i++) {
      const tier = TIERS[i];
      const chip = el('button', {
        class: 'chip chip-quiet',
        type: 'button',
        text: tier.name,
        onclick: (function (index) {
          return function () { self.handlers.onQuality(index); };
        })(i),
      });
      this.qualityNodes.push(chip);
      qualityRow.appendChild(chip);
    }
    this.host.appendChild(el('section', { class: 'dock-section' }, [
      el('h3', { class: 'dock-h', text: '画质' }),
      qualityRow,
      el('p', { class: 'dock-blurb', id: 'quality-blurb' }),
    ]));

    for (let g = 0; g < GROUPS.length; g++) this.host.appendChild(this.buildGroup(GROUPS[g]));

    this.host.appendChild(el('section', { class: 'dock-section' }, [
      el('h3', { class: 'dock-h', text: '操作' }),
      el('div', { class: 'chip-row' }, [
        this.action('重置流体', 'reset'),
        this.action('截图', 'screenshot'),
        this.action('暂停 / 继续', 'pause'),
        this.action('清屏', 'clear'),
        this.action('体感重力', 'motion', 'chip-quiet'),
        this.action('隐藏 HUD', 'hud', 'chip-quiet'),
      ]),
      el('p', { class: 'dock-blurb', text: '键盘：空格暂停 · R 重置 · S 截图 · H 面板 · 1-6 预设' }),
    ]));

    this.host.appendChild(el('div', { class: 'dock-tail' }));
  }

  action(label, name, extra) {
    const self = this;
    const node = el('button', {
      class: 'chip ' + (extra || ''),
      type: 'button',
      text: label,
      onclick: function () { self.handlers.onAction(name); },
    });
    this.actionNodes.set(name, node);
    return node;
  }

  buildGroup(group) {
    const body = el('div', { class: 'dock-section' }, [el('h3', { class: 'dock-h', text: group.title })]);
    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i];
      if (item.type === 'seg') body.appendChild(this.buildSegmented(item));
      else if (item.type === 'switch') body.appendChild(this.buildSwitch(item));
      else body.appendChild(this.buildSlider(item));
    }
    return body;
  }

  buildSlider(item) {
    const self = this;
    const value = el('span', { class: 'ctl-value', text: '--' });
    const input = el('input', {
      class: 'ctl-range',
      type: 'range',
      min: item.min,
      max: item.max,
      step: item.step,
      oninput: function (event) {
        const v = parseFloat(event.target.value);
        value.textContent = v.toFixed(item.digits);
        self.handlers.onParam(item.key, v);
      },
    });
    const row = el('label', { class: 'ctl' }, [
      el('span', { class: 'ctl-label' }, [el('span', { text: item.label }), value]),
      input,
    ]);
    this.rows.set(item.key, { input: input, value: value, item: item });
    return row;
  }

  buildSwitch(item) {
    const self = this;
    const input = el('input', {
      class: 'ctl-check',
      type: 'checkbox',
      onchange: function (event) { self.handlers.onParam(item.key, event.target.checked); },
    });
    const row = el('label', { class: 'ctl ctl-inline' }, [
      el('span', { class: 'ctl-label' }, [el('span', { text: item.label })]),
      input,
    ]);
    this.rows.set(item.key, { input: input, item: item });
    return row;
  }

  buildSegmented(item) {
    const self = this;
    const group = el('div', { class: 'seg' });
    const buttons = [];
    for (let i = 0; i < item.options.length; i++) {
      const option = item.options[i];
      const button = el('button', {
        class: 'seg-btn',
        type: 'button',
        text: option.label,
        onclick: function () { self.handlers.onParam(item.key, option.value); },
      });
      buttons.push({ node: button, value: option.value });
      group.appendChild(button);
    }
    const row = el('div', { class: 'ctl' }, [
      el('span', { class: 'ctl-label' }, [el('span', { text: item.label })]),
      group,
    ]);
    this.rows.set(item.key, { segmented: buttons, item: item });
    return row;
  }

  sync(params) {
    const self = this;
    this.rows.forEach(function (row, key) {
      const value = params[key];
      if (row.input) {
        if (row.input.type === 'checkbox') {
          row.input.checked = !!value;
        } else {
          row.input.value = String(value);
          if (row.value) row.value.textContent = Number(value).toFixed(row.item.digits);
        }
      } else if (row.segmented) {
        for (let i = 0; i < row.segmented.length; i++) {
          row.segmented[i].node.classList.toggle('is-on', row.segmented[i].value === value);
        }
      }
    });
  }

  setPreset(id, blurb) {
    this.presetNodes.forEach(function (node, key) {
      node.classList.toggle('is-on', key === id);
    });
    const target = this.host.querySelector('#preset-blurb');
    if (target) target.textContent = blurb || '';
  }

  setQuality(index, locked, note) {
    const active = locked ? index + 1 : 0;
    for (let i = 0; i < this.qualityNodes.length; i++) {
      this.qualityNodes[i].classList.toggle('is-on', i === active);
    }
    const target = this.host.querySelector('#quality-blurb');
    if (target) {
      const prefix = locked ? '已锁定：' : '自动调节中：';
      target.textContent = prefix + (note || '');
    }
  }

  setActionState(name, on) {
    const node = this.actionNodes.get(name);
    if (node) node.classList.toggle('is-on', !!on);
  }

  setOpen(on) {
    this.open = on;
    this.host.classList.toggle('is-open', on);
  }

  setVisible(on) {
    this.host.classList.toggle('is-hidden', !on);
  }
}
