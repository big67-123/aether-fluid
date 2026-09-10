// aether-fluid :: glsl/particles.js
// Lagrangian tracer particles. Integration happens entirely on the GPU through
// WebGL2 transform feedback: the vertex stage reads particle state from a VBO,
// samples the velocity field, and writes the new state straight back out.

// Transform-feedback integrator: RK1 advection of tracers by the velocity field.
export const PARTICLE_VERT_UPDATE = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aState;
out vec4 vState;
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uAspect;
uniform float uSpeed;
uniform float uTime;
uniform float uMaxSpeed;
uniform float uLife;
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453123); }
void main() {
  vec2 p = aState.xy;
  float seed = aState.z;
  float age = aState.w;
  vec2 v = texture(uVelocity, clamp(p, 0.0, 1.0)).xy;
  float sp = length(v);
  if (sp > uMaxSpeed) v *= uMaxSpeed / sp;
  vec2 next = p + uDt * uSpeed * vec2(v.x / uAspect, v.y);
  age += uDt;
  float gone = step(next.x, 0.0) + step(1.0, next.x) + step(next.y, 0.0) + step(1.0, next.y);
  if (gone > 0.0 || age > uLife) {
    float bucket = floor(uTime * 6.0) + seed * 37.0;
    next = vec2(
      0.03 + 0.94 * hash11(bucket * 1.13 + seed),
      0.03 + 0.94 * hash11(bucket * 2.71 + seed * 3.3));
    age = 0.0;
  }
  vState = vec4(next, seed, age);
  gl_Position = vec4(0.0);
  gl_PointSize = 1.0;
}
`;


export const PARTICLE_VERT_DRAW = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aState;
uniform float uPointSize;
uniform float uLife;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform float uOpacity;
out vec3 vTint;
out float vAlpha;
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453123); }
void main() {
  vec2 p = aState.xy;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  float h = fract(aState.z * 1.61803398875);
  gl_PointSize = uPointSize * (0.55 + 0.9 * hash11(aState.z * 7.31 + 1.7));
  vTint = mix(uTintA, uTintB, h);
  float fade = smoothstep(0.0, 0.18, aState.w) *
               (1.0 - smoothstep(uLife * 0.72, uLife, aState.w));
  vAlpha = uOpacity * fade * (0.45 + 0.55 * h);
}
`;


// Premultiplied additive point sprite; blending is (ONE, ONE).
// A program object needs a fragment stage even when rasterization is discarded.
export const PARTICLE_FRAG_IDLE = `#version 300 es
precision mediump float;
out vec4 outColor;
void main() { outColor = vec4(0.0); }
`;

export const PARTICLE_FRAG_DRAW = `#version 300 es
precision highp float;
in vec3 vTint;
in float vAlpha;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float a = exp(-r2 * 11.0) * vAlpha;
  outColor = vec4(vTint * a, a);
}
`;

