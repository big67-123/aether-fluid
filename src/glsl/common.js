// aether-fluid :: glsl/common.js
// Shared vertex stage, fragment preamble and small GLSL utilities.
// Every shader in this project is hand-written GLSL ES 3.00.

// One fullscreen triangle. gl_VertexID gives (0,0) (2,0) (0,2) which maps to
// clip space (-1,-1) (3,-1) (-1,3); vUv runs 0..1 across the visible area.
export const VERT_FULLSCREEN = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 c = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = c;
  gl_Position = vec4(c * 2.0 - 1.0, 0.0, 1.0);
}
`;


// Small, dependency-free hash used for grain, particle tint and respawn.
export const HASH = `float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453123);
}
`;


// Compose a fragment shader with the standard preamble. `prelude` carries the
// uniform declarations and #defines for that pass.
export function frag(body, prelude) {
  const parts = ['#version 300 es', 'precision highp float;', 'precision highp int;', 'in vec2 vUv;', 'out vec4 outColor;'];
  if (prelude) parts.push(prelude);
  parts.push(body);
  return parts.join('\n');
}
