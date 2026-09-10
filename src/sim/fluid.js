// aether-fluid :: sim/fluid.js
// The GPU solver. Everything below is plain WebGL2 render passes; there is no
// compute-shader extension and no library involved.

import { Program } from '../core/program.js';
import { RenderTarget, DoubleTarget } from '../core/target.js';
import { VERT_FULLSCREEN } from '../glsl/common.js';
import * as S from '../glsl/fluid.js';
import * as P from '../glsl/display.js';

export const SPLAT_MAX = S.SPLAT_MAX;

function makeLane() {
  return {
    count: 0,
    vec: new Float32Array(SPLAT_MAX * 4),
    val: new Float32Array(SPLAT_MAX * 4),
  };
}

function push(lane, x, y, radius, strength, v0, v1, v2, v3) {
  if (lane.count >= SPLAT_MAX) return;
  const i = lane.count * 4;
  lane.vec[i] = x;
  lane.vec[i + 1] = y;
  lane.vec[i + 2] = radius;
  lane.vec[i + 3] = strength;
  lane.val[i] = v0;
  lane.val[i + 1] = v1;
  lane.val[i + 2] = v2;
  lane.val[i + 3] = v3;
  lane.count++;
}
export class Fluid {
  constructor(gl, caps, quad) {
    this.gl = gl;
    this.caps = caps;
    this.quad = quad;
    const mk = function (fs, label) { return new Program(gl, VERT_FULLSCREEN, fs, label); };
    this.p = {
      splat: mk(S.splatShader(), 'splat'),
      advect: mk(S.advectShader(), 'advect'),
      curl: mk(S.curlShader(), 'curl'),
      vorticity: mk(S.vorticityShader(), 'vorticity'),
      divergence: mk(S.divergenceShader(), 'divergence'),
      jacobi: mk(S.jacobiShader(), 'jacobi'),
      gradient: mk(S.gradientShader(), 'gradient'),
      forces: mk(S.bodyForcesShader(), 'body-forces'),
      scale: mk(S.scaleShader(), 'scale'),
      bloomPre: mk(P.bloomPrefilterShader(), 'bloom-prefilter'),
      bloomBlur: mk(P.bloomBlurShader(), 'bloom-blur'),
      display: mk(P.displayShader(), 'display'),
    };
    this.simW = 0;
    this.simH = 0;
    this.aspect = 1;
    this.useBloom = true;
    this.triangles = 0;
    this.velocity = null;
    this.dye = null;
    this.pressure = null;
    this.divergence = null;
    this.curl = null;
    this.bloomA = null;
    this.bloomB = null;
    this.velocityLane = makeLane();
    this.dyeLane = makeLane();
    this.gravity = new Float32Array([0, 0]);
  }

  // ------------------------------------------------------------------ helpers

  bindTexture(unit, texture, program, name) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    program.set(name, unit);
    return this;
  }

  drawTo(target) {
    target.bind();
    this.quad.draw();
    this.triangles++;
    return this;
  }

  blit(src, dst) {
    if (!src || !dst) return;
    const pr = this.p.scale;
    pr.use();
    this.bindTexture(0, src.texture, pr, 'uSource');
    pr.set('uScale', 1, 1, 1, 1);
    this.drawTo(dst);
  }

  // ------------------------------------------------------------- allocation

  // The simulation grid follows the *display* aspect so cells stay square in
  // world space; `simLong` pins the long side to the current quality tier.
  computeGrid(dispW, dispH, simLong) {
    const aspect = dispW / dispH;
    let w;
    let h;
    if (aspect >= 1) { w = simLong; h = Math.round(simLong / aspect); }
    else { h = simLong; w = Math.round(simLong * aspect); }
    w = Math.max(32, Math.min(this.caps.maxTextureSize, w));
    h = Math.max(32, Math.min(this.caps.maxTextureSize, h));
    return { w: w, h: h };
  }

  allocate(dispW, dispH, simLong, useBloom) {
    const gl = this.gl;
    const grid = this.computeGrid(dispW, dispH, simLong);
    this.useBloom = useBloom;
    const self = this;
    const blit = function (src, dst) { self.blit(src, dst); };
    const format = this.caps.format;
    const first = this.simW === 0;

    this.simW = grid.w;
    this.simH = grid.h;
    this.aspect = grid.w / grid.h;

    if (first) {
      this.velocity = new DoubleTarget(gl, format, grid.w, grid.h);
      this.dye = new DoubleTarget(gl, format, grid.w, grid.h);
      this.pressure = new DoubleTarget(gl, format, grid.w, grid.h);
      this.divergence = new RenderTarget(gl, format, grid.w, grid.h);
      this.curl = new RenderTarget(gl, format, grid.w, grid.h);
      this.reset();
    } else {
      // Preserve the fields across an adaptive-resolution change so the picture
      // never blinks when the governor moves a tier.
      this.velocity.resize(grid.w, grid.h, blit);
      this.dye.resize(grid.w, grid.h, blit);
      this.pressure.resize(grid.w, grid.h, null);
      this.divergence.allocate(grid.w, grid.h);
      this.curl.allocate(grid.w, grid.h);
    }

    const bw = Math.max(16, Math.round(dispW / 4));
    const bh = Math.max(16, Math.round(dispH / 4));
    if (!this.bloomA) {
      this.bloomA = new RenderTarget(gl, format, bw, bh);
      this.bloomB = new RenderTarget(gl, format, bw, bh);
    } else {
      this.bloomA.allocate(bw, bh);
      this.bloomB.allocate(bw, bh);
    }
    return this;
  }

  reset() {
    if (!this.velocity) return;
    this.velocity.clear(0, 0, 0, 0);
    this.dye.clear(0, 0, 0, 0);
    this.pressure.clear(0, 0, 0, 0);
    this.divergence.clear(0, 0, 0, 0);
    this.curl.clear(0, 0, 0, 0);
    this.gravity[0] = 0;
    this.gravity[1] = 0;
    this.triangles = 0;
  }

  // ------------------------------------------------------------------ splats

  beginSplats() {
    this.velocityLane.count = 0;
    this.dyeLane.count = 0;
  }

  addForce(x, y, radius, strength, vx, vy) {
    push(this.velocityLane, x, y, radius, strength, vx, vy, 0, 0);
  }

  addDye(x, y, radius, strength, r, g, b, heat) {
    push(this.dyeLane, x, y, radius, strength, r, g, b, heat);
  }

  // mode 0 = additive (dye is a scalar field), mode 1 = relax toward the value
  // (velocity is a state we want to drive, not an accumulator). Relaxation keeps
  // pointer drags frame-rate independent: the fluid under the finger is pinned to
  // the finger's velocity and blends out along the gaussian.
  applyLane(lane, target, mode) {
    if (lane.count === 0) return;
    const pr = this.p.splat;
    pr.use();
    this.bindTexture(0, target.read.texture, pr, 'uTarget');
    pr.set('uSplats', lane.vec);
    pr.set('uSplatValues', lane.val);
    pr.set('uSplatCount', lane.count);
    pr.set('uAspect', this.aspect);
    pr.set('uMode', mode);
    this.drawTo(target.write);
    target.swap();
  }

  // ----------------------------------------------------------------- pipeline

  step(dt, params) {
    const tx = 1 / this.simW;
    const ty = 1 / this.simH;
    const texel = [tx, ty];
    const aspect = this.aspect;
    const P0 = this.p;

    // 1. Self-advection of the velocity field, MacCormack when the tier allows.
    const dampV = Math.exp(-params.damping * dt);
    P0.advect.use();
    this.bindTexture(0, this.velocity.read.texture, P0.advect, 'uVelocity');
    this.bindTexture(1, this.velocity.read.texture, P0.advect, 'uSource');
    P0.advect.set('uTexel', texel).set('uDt', dt).set('uAspect', aspect);
    P0.advect.set('uDecay', dampV, dampV, 0, 0);
    P0.advect.set('uOrder', params.order);
    this.drawTo(this.velocity.write);
    this.velocity.swap();

    // 2. Vorticity: measure the curl, then push energy back along its gradient.
    P0.curl.use();
    this.bindTexture(0, this.velocity.read.texture, P0.curl, 'uVelocity');
    P0.curl.set('uTexel', texel);
    this.drawTo(this.curl);

    P0.vorticity.use();
    this.bindTexture(0, this.velocity.read.texture, P0.vorticity, 'uVelocity');
    this.bindTexture(1, this.curl.texture, P0.vorticity, 'uCurl');
    P0.vorticity.set('uTexel', texel).set('uDt', dt);
    P0.vorticity.set('uStrength', params.curl).set('uMaxSpeed', params.maxSpeed);
    this.drawTo(this.velocity.write);
    this.velocity.swap();

    // 3. Body forces: thermal buoyancy, dye weight, device gravity, idle stir.
    P0.forces.use();
    this.bindTexture(0, this.velocity.read.texture, P0.forces, 'uVelocity');
    this.bindTexture(1, this.dye.read.texture, P0.forces, 'uDye');
    P0.forces.set('uDt', dt).set('uAspect', aspect).set('uMaxSpeed', params.maxSpeed);
    P0.forces.set('uBuoyancy', params.buoyancy).set('uWeight', params.weight);
    P0.forces.set('uGravity', this.gravity);
    P0.forces.set('uStir', params.stirActive).set('uTime', params.time);
    this.drawTo(this.velocity.write);
    this.velocity.swap();

    // 4. Pointer impulses enter the velocity field.
    this.applyLane(this.velocityLane, this.velocity, 1);

    // 5. Pressure projection. Warm-starting from the previous frame lets us use
    //    far fewer Jacobi sweeps than a cold solve would need.
    P0.divergence.use();
    this.bindTexture(0, this.velocity.read.texture, P0.divergence, 'uVelocity');
    P0.divergence.set('uTexel', texel);
    this.drawTo(this.divergence);

    const warm = Math.exp(-params.pressureDamp * dt);
    P0.scale.use();
    this.bindTexture(0, this.pressure.read.texture, P0.scale, 'uSource');
    P0.scale.set('uScale', warm, warm, warm, warm);
    this.drawTo(this.pressure.write);
    this.pressure.swap();

    const sweeps = Math.max(1, params.pressure | 0);
    P0.jacobi.use();
    P0.jacobi.set('uTexel', texel);
    this.bindTexture(1, this.divergence.texture, P0.jacobi, 'uDivergence');
    for (let i = 0; i < sweeps; i++) {
      this.bindTexture(0, this.pressure.read.texture, P0.jacobi, 'uPressure');
      this.drawTo(this.pressure.write);
      this.pressure.swap();
    }

    P0.gradient.use();
    this.bindTexture(0, this.velocity.read.texture, P0.gradient, 'uVelocity');
    this.bindTexture(1, this.pressure.read.texture, P0.gradient, 'uPressure');
    P0.gradient.set('uTexel', texel);
    this.drawTo(this.velocity.write);
    this.velocity.swap();

    // 6. Advect dye and heat by the now divergence-free velocity field.
    const fade = Math.exp(-params.dyeFade * dt);
    const cool = Math.exp(-params.heatCool * dt);
    P0.advect.use();
    this.bindTexture(0, this.velocity.read.texture, P0.advect, 'uVelocity');
    this.bindTexture(1, this.dye.read.texture, P0.advect, 'uSource');
    P0.advect.set('uTexel', texel).set('uDt', dt).set('uAspect', aspect);
    P0.advect.set('uDecay', fade, fade, fade, cool);
    P0.advect.set('uOrder', params.order);
    this.drawTo(this.dye.write);
    this.dye.swap();

    this.applyLane(this.dyeLane, this.dye, 0);
  }

  // ------------------------------------------------------------------- output

  render(params, width, height) {
    const gl = this.gl;
    const P0 = this.p;
    let bloomTexture = this.bloomA.texture;
    const bloomActive = this.useBloom && params.bloom > 0.001;

    if (bloomActive) {
      P0.bloomPre.use();
      this.bindTexture(0, this.dye.read.texture, P0.bloomPre, 'uSource');
      P0.bloomPre.set('uThreshold', params.bloomThreshold);
      this.drawTo(this.bloomA);

      P0.bloomBlur.use();
      this.bindTexture(0, this.bloomA.texture, P0.bloomBlur, 'uSource');
      P0.bloomBlur.set('uDir', 1 / this.bloomA.width, 0);
      this.drawTo(this.bloomB);

      this.bindTexture(0, this.bloomB.texture, P0.bloomBlur, 'uSource');
      P0.bloomBlur.set('uDir', 0, 1 / this.bloomA.height);
      this.drawTo(this.bloomA);
      bloomTexture = this.bloomA.texture;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    P0.display.use();
    this.bindTexture(0, this.dye.read.texture, P0.display, 'uDye');
    this.bindTexture(1, bloomTexture, P0.display, 'uBloom');
    P0.display.set('uTexel', 1 / this.simW, 1 / this.simH);
    P0.display.set('uResolution', width, height);
    P0.display.set('uExposure', params.exposure);
    P0.display.set('uBloomStrength', bloomActive ? params.bloom : 0);
    P0.display.set('uCrisp', params.crisp);
    P0.display.set('uVignette', params.vignette);
    P0.display.set('uGrain', params.grain);
    P0.display.set('uTime', params.time);
    P0.display.set('uAbsorb', params.absorb);
    P0.display.set('uGamma', params.gamma);
    P0.display.set('uBlend', params.blend);
    P0.display.set('uTonemap', params.tonemap);
    P0.display.set('uBase', params.base);
    P0.display.set('uBaseTop', params.baseTop);
    this.quad.draw();
    this.triangles++;
    return this;
  }

  dispose() {
    const keys = Object.keys(this.p);
    for (let i = 0; i < keys.length; i++) this.p[keys[i]].dispose();
    if (this.velocity) {
      this.velocity.dispose();
      this.dye.dispose();
      this.pressure.dispose();
      this.divergence.dispose();
      this.curl.dispose();
      this.bloomA.dispose();
      this.bloomB.dispose();
    }
  }
}
