// aether-fluid :: glsl/display.js
// Presentation passes: a mip-chain HDR bloom and the final composite.

import { frag, HASH } from './common.js';

// Soft-knee bright pass at the finest bloom level.
export const BLOOM_PREFILTER = `uniform sampler2D uSource;
uniform float uThreshold;
void main() {
  vec3 c = texture(uSource, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = uThreshold * 0.55 + 1e-5;
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-6);
  float contrib = max(soft, l - uThreshold) / max(l, 1e-5);
  outColor = vec4(c * contrib, 1.0);
}
`;


// 9-tap tent downsample (weights sum to 1) for the bloom mip chain.
export const BLOOM_DOWN = `uniform sampler2D uSource;
uniform vec2 uTexel;
void main() {
  vec2 t = uTexel;
  vec3 s = texture(uSource, vUv).rgb * 0.25;
  s += (texture(uSource, vUv + vec2(-t.x, 0.0)).rgb +
        texture(uSource, vUv + vec2(t.x, 0.0)).rgb +
        texture(uSource, vUv + vec2(0.0, -t.y)).rgb +
        texture(uSource, vUv + vec2(0.0, t.y)).rgb) * 0.125;
  s += (texture(uSource, vUv + vec2(-t.x, -t.y)).rgb +
        texture(uSource, vUv + vec2(t.x, -t.y)).rgb +
        texture(uSource, vUv + vec2(-t.x, t.y)).rgb +
        texture(uSource, vUv + vec2(t.x, t.y)).rgb) * 0.0625;
  outColor = vec4(s, 1.0);
}
`;


// 9-tap Gaussian collapsed into 5 bilinear samples (weights sum to 1).
export const BLOOM_BLUR = `uniform sampler2D uSource;
uniform vec2 uDir;
void main() {
  vec3 acc = texture(uSource, vUv).rgb * 0.2270270270;
  acc += texture(uSource, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  acc += texture(uSource, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  acc += texture(uSource, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  acc += texture(uSource, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(acc, 1.0);
}
`;


// Tent upsample-add. An explicit add instead of blending keeps 32F targets valid.
export const BLOOM_UP = `uniform sampler2D uSource;
uniform sampler2D uBase;
uniform vec2 uTexel;
uniform float uWeight;
void main() {
  vec2 t = uTexel;
  vec3 s = texture(uSource, vUv + vec2(-t.x, -t.y)).rgb;
  s += texture(uSource, vUv + vec2(t.x, -t.y)).rgb;
  s += texture(uSource, vUv + vec2(-t.x, t.y)).rgb;
  s += texture(uSource, vUv + vec2(t.x, t.y)).rgb;
  outColor = vec4(texture(uBase, vUv).rgb + s * 0.25 * uWeight, 1.0);
}
`;


// Final composite: dye -> substrate, bloom, exposure, tonemap, gamma, grain.
export const DISPLAY = `uniform sampler2D uDye;
uniform sampler2D uBloom;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uCrisp;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uAbsorb;
uniform float uGamma;
uniform int uBlend;
uniform int uTonemap;
uniform vec3 uBase;
uniform vec3 uBaseTop;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 dye = texture(uDye, vUv).rgb;
  if (uCrisp > 0.0) {
    vec3 blur = 0.25 * (
      texture(uDye, vUv + vec2(uTexel.x, 0.0)).rgb +
      texture(uDye, vUv - vec2(uTexel.x, 0.0)).rgb +
      texture(uDye, vUv + vec2(0.0, uTexel.y)).rgb +
      texture(uDye, vUv - vec2(0.0, uTexel.y)).rgb);
    dye = max(dye + (dye - blur) * uCrisp, vec3(0.0));
  }
  vec3 base = mix(uBase, uBaseTop, vUv.y);
  vec3 col;
  if (uBlend == 1) {
    col = base * exp(-dye * uAbsorb);
  } else {
    col = base + dye;
  }
  col += texture(uBloom, vUv).rgb * uBloomStrength;
  col *= uExposure;
  if (uTonemap == 1) col = aces(col);
  col = pow(max(col, vec3(0.0)), vec3(1.0 / uGamma));
  vec2 q = vUv - 0.5;
  col *= 1.0 - uVignette * dot(q, q) * 1.7;
  col += (hash12(vUv * uResolution + fract(uTime) * 311.7) - 0.5) * uGrain;
  outColor = vec4(col, 1.0);
}
`;


export function bloomPrefilterShader() { return frag(BLOOM_PREFILTER); }
export function bloomDownShader() { return frag(BLOOM_DOWN); }
export function bloomBlurShader() { return frag(BLOOM_BLUR); }
export function bloomUpShader() { return frag(BLOOM_UP); }
export function displayShader() { return frag(DISPLAY, HASH); }
