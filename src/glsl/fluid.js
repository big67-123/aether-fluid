// aether-fluid :: glsl/fluid.js
// The solver passes. Physics: incompressible Navier-Stokes on a staggered-free
// collocated grid, solved with the classic operator-splitting scheme
//   advect -> body forces -> vorticity confinement -> project (divergence-free).
// Advection is 2nd-order MacCormack with a monotonicity limiter.

import { frag } from './common.js';

// ---------------------------------------------------------------------------
// Gaussian splat accumulation. All active pointers are merged into a single
// pass, so N fingers still cost exactly one fullscreen pass.
// ---------------------------------------------------------------------------
export const SPLAT = `uniform sampler2D uTarget;
uniform vec4 uSplats[MAX_SPLATS];
uniform vec4 uSplatValues[MAX_SPLATS];
uniform int uSplatCount;
uniform float uAspect;
uniform int uMode;
void main() {
  vec4 acc = texture(uTarget, vUv);
  for (int i = 0; i < MAX_SPLATS; i++) {
    if (i >= uSplatCount) break;
    vec4 s = uSplats[i];
    vec2 d = vUv - s.xy;
    d.x *= uAspect;
    float r = max(s.z, 1e-5);
    float falloff = exp(-dot(d, d) / (r * r));
    float weight = clamp(falloff * s.w, 0.0, 1.0);
    if (uMode == 0) {
      acc += uSplatValues[i] * weight;
    } else {
      acc = mix(acc, uSplatValues[i], weight);
    }
  }
  outColor = acc;
}
`;

// ---------------------------------------------------------------------------
// Advection. uOrder == 1 -> semi-Lagrangian (1 tap), uOrder == 2 -> MacCormack
// (7 taps) with a min/max limiter that keeps the field free of new extrema.
// Velocity lives in height-normalised world units, hence the /uAspect on x.
// ---------------------------------------------------------------------------
export const ADVECT = `uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uAspect;
uniform vec4 uDecay;
uniform int uOrder;
vec2 guard(vec2 uv) { return clamp(uv, uTexel * 0.5, 1.0 - uTexel * 0.5); }
void main() {
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 world = vec2(vel.x / uAspect, vel.y);
  vec2 back = guard(vUv - uDt * world);
  vec4 base = texture(uSource, back);
  vec4 result = base;
  if (uOrder > 1) {
    vec2 velBack = texture(uVelocity, back).xy;
    vec2 worldBack = vec2(velBack.x / uAspect, velBack.y);
    vec2 fwd = guard(back + uDt * worldBack);
    vec4 origin = texture(uSource, vUv);
    vec4 forward = texture(uSource, fwd);
    vec4 corrected = base + 0.5 * (origin - forward);
    vec4 n0 = texture(uSource, guard(back - vec2(uTexel.x, 0.0)));
    vec4 n1 = texture(uSource, guard(back + vec2(uTexel.x, 0.0)));
    vec4 n2 = texture(uSource, guard(back - vec2(0.0, uTexel.y)));
    vec4 n3 = texture(uSource, guard(back + vec2(0.0, uTexel.y)));
    vec4 lo = min(min(min(n0, n1), min(n2, n3)), base);
    vec4 hi = max(max(max(n0, n1), max(n2, n3)), base);
    result = clamp(corrected, lo, hi);
  }
  outColor = result * uDecay;
}
`;

// Vorticity magnitude (z-component of curl) of the velocity field.
export const CURL = `uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  outColor = vec4(0.5 * ((r - l) - (t - b)), 0.0, 0.0, 1.0);
}
`;

// Vorticity confinement: re-injects energy lost to numerical diffusion.
export const VORTICITY = `uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uDt;
uniform float uStrength;
uniform float uMaxSpeed;
void main() {
  float l = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float c = texture(uCurl, vUv).x;
  vec2 grad = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
  grad /= (length(grad) + 1e-5);
  vec2 force = uStrength * vec2(grad.y, -grad.x) * c;
  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  outColor = vec4(clamp(vel, -uMaxSpeed, uMaxSpeed), 0.0, 1.0);
}
`;

export const DIVERGENCE = `uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  outColor = vec4(0.5 * ((r - l) + (t - b)), 0.0, 0.0, 1.0);
}
`;

// One Jacobi sweep of the Poisson problem Laplacian(p) = divergence(u).
export const JACOBI = `uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div = texture(uDivergence, vUv).x;
  outColor = vec4((l + r + b + t - div) * 0.25, 0.0, 0.0, 1.0);
}
`;

// Projection step: subtract the pressure gradient, then enforce the walls.
export const GRADIENT = `uniform sampler2D uVelocity;
uniform sampler2D uPressure;
uniform vec2 uTexel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 vel = texture(uVelocity, vUv).xy - 0.5 * vec2(r - l, t - b);
  // Solid container walls: kill the velocity component normal to each edge.
  vec2 edge = min(vUv, 1.0 - vUv) / max(uTexel, vec2(1e-6));
  vel.x *= smoothstep(0.0, 1.25, edge.x);
  vel.y *= smoothstep(0.0, 1.25, edge.y);
  outColor = vec4(vel, 0.0, 1.0);
}
`;

// Thermal buoyancy, dye weight, device gravity and the idle auto-stir field.
export const BODY_FORCES = `uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform float uDt;
uniform float uBuoyancy;
uniform float uWeight;
uniform vec2 uGravity;
uniform float uStir;
uniform float uTime;
uniform float uAspect;
uniform float uMaxSpeed;
void main() {
  vec2 vel = texture(uVelocity, vUv).xy;
  vec4 dye = texture(uDye, vUv);
  vel.y += uBuoyancy * dye.a * uDt;
  vel.y -= uWeight * (dye.r + dye.g + dye.b) * 0.3333333 * uDt;
  vel += uGravity * uDt;
  if (uStir > 0.0) {
    vec2 c1 = vec2(0.5 - 0.27 * cos(uTime * 0.31), 0.5 + 0.21 * sin(uTime * 0.23));
    vec2 c2 = vec2(0.5 + 0.25 * cos(uTime * 0.19 + 2.1), 0.5 - 0.23 * sin(uTime * 0.27 + 1.3));
    vec2 d1 = vUv - c1; d1.x *= uAspect;
    vec2 d2 = vUv - c2; d2.x *= uAspect;
    vec2 t1 = vec2(-d1.y, d1.x) * exp(-dot(d1, d1) * 7.0);
    vec2 t2 = vec2(d2.y, -d2.x) * exp(-dot(d2, d2) * 7.0);
    vel += (t1 + t2) * uStir * uDt;
  }
  outColor = vec4(clamp(vel, -uMaxSpeed, uMaxSpeed), 0.0, 1.0);
}
`;

// Generic multiply / copy-with-resample used for pressure warm-start damping
// and for preserving state across adaptive-resolution changes.
export const SCALE = `uniform sampler2D uSource;
uniform vec4 uScale;
void main() {
  outColor = texture(uSource, vUv) * uScale;
}
`;

export const SPLAT_MAX = 10;

export function splatShader() {
  return frag(SPLAT, '#define MAX_SPLATS ' + SPLAT_MAX);
}
export function advectShader() { return frag(ADVECT); }
export function curlShader() { return frag(CURL); }
export function vorticityShader() { return frag(VORTICITY); }
export function divergenceShader() { return frag(DIVERGENCE); }
export function jacobiShader() { return frag(JACOBI); }
export function gradientShader() { return frag(GRADIENT); }
export function bodyForcesShader() { return frag(BODY_FORCES); }
export function scaleShader() { return frag(SCALE); }

