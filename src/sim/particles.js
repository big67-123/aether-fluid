// aether-fluid :: sim/particles.js
// GPU tracer particles driven entirely by WebGL2 transform feedback.
// State per particle: vec4(px, py, seed, age). Two VBOs ping-pong so a draw
// never reads and writes the same buffer in one pass.

import { Program } from '../core/program.js';
import { PARTICLE_VERT_UPDATE, PARTICLE_VERT_DRAW, PARTICLE_FRAG_DRAW, PARTICLE_FRAG_IDLE } from '../glsl/particles.js';

const FLOATS_PER_PARTICLE = 4;

export class Particles {
  constructor(gl, caps) {
    this.gl = gl;
    this.caps = caps;
    this.update = new Program(gl, PARTICLE_VERT_UPDATE, PARTICLE_FRAG_IDLE, 'particle-update', {
      varyings: ['vState'],
    });
    this.drawProgram = new Program(gl, PARTICLE_VERT_DRAW, PARTICLE_FRAG_DRAW, 'particle-draw');
    this.buffers = [null, null];
    this.vaos = [null, null];
    this.count = 0;
    this.index = 0;
    let range = [1, 64];
    try { range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || range; } catch (err) { range = [1, 64]; }
    this.maxPointSize = range[1] || 64;
  }

  allocate(count) {
    if (count === this.count) return;
    const gl = this.gl;
    this.release();
    this.count = count;
    this.index = 0;
    if (count === 0) return;

    const data = new Float32Array(count * FLOATS_PER_PARTICLE);
    for (let i = 0; i < count; i++) {
      const o = i * FLOATS_PER_PARTICLE;
      data[o] = 0.03 + Math.random() * 0.94;
      data[o + 1] = 0.03 + Math.random() * 0.94;
      data[o + 2] = Math.random() * 1024;
      data[o + 3] = Math.random() * 5.5;
    }

    for (let b = 0; b < 2; b++) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY);
      this.buffers[b] = buf;

      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.vaos[b] = vao;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  step(dt, velocityTexture, params, aspect) {
    if (this.count === 0) return;
    const gl = this.gl;
    const src = this.index;
    const dst = 1 - this.index;
    const pr = this.update;

    pr.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocityTexture);
    pr.set('uVelocity', 0);
    pr.set('uDt', dt);
    pr.set('uAspect', aspect);
    pr.set('uSpeed', params.particleSpeed);
    pr.set('uMaxSpeed', params.maxSpeed);
    pr.set('uLife', params.particleLife);
    pr.set('uTime', params.time);

    gl.bindVertexArray(this.vaos[src]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.buffers[dst]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindVertexArray(null);
    this.index = dst;
  }

  draw(params, pixelRatio) {
    if (this.count === 0) return;
    const gl = this.gl;
    const pr = this.drawProgram;
    const size = Math.max(1, Math.min(this.maxPointSize, params.particleSize * pixelRatio));
    pr.use();
    pr.set('uPointSize', size);
    pr.set('uLife', params.particleLife);
    pr.set('uOpacity', params.particleOpacity);
    pr.set('uTintA', params.tintA);
    pr.set('uTintB', params.tintB);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.vaos[this.index]);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  release() {
    const gl = this.gl;
    for (let b = 0; b < 2; b++) {
      if (this.buffers[b]) gl.deleteBuffer(this.buffers[b]);
      if (this.vaos[b]) gl.deleteVertexArray(this.vaos[b]);
      this.buffers[b] = null;
      this.vaos[b] = null;
    }
    this.count = 0;
  }

  dispose() {
    this.release();
    this.update.dispose();
    this.drawProgram.dispose();
  }
}
