// aether-fluid :: ui/dom.js
// Micro DOM helpers. No framework, no templating language.

export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key in attrs) {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value);
    }
  }
  if (children) {
    const list = Array.isArray(children) ? children : [children];
    for (let i = 0; i < list.length; i++) {
      const child = list[i];
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

export function rgbToCss(rgb) {
  return 'rgb(' + Math.round(clamp(rgb[0], 0, 1) * 255) + ',' +
    Math.round(clamp(rgb[1], 0, 1) * 255) + ',' +
    Math.round(clamp(rgb[2], 0, 1) * 255) + ')';
}
