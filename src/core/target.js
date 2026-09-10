// aether-fluid :: core/target.js
// Immutable-storage render targets (texStorage2D) with ping-pong support and
// linear-filtered blit-on-resize so an adaptive quality change never wipes the
// simulation state.

export class RenderTarget {
  constructor(gl, format, width, height) {
    this.gl = gl;
    this.format = format;
    this.texture = null;
    this.fbo = null;
    this.width = 0;
    this.height = 0;
    this.allocate(width, height);
  }

  allocate(width, height) {
    const gl = this.gl;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, this.format.internalFormat, this.width, this.height);
    this.texture = tex;

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fbo = fbo;
    return this;
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
    return this;
  }

  clear(r, g, b, a) {
    const gl = this.gl;
    this.bind();
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return this;
  }

  dispose() {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.texture = null;
    this.fbo = null;
  }
}

export class DoubleTarget {
  constructor(gl, format, width, height) {
    this.gl = gl;
    this.format = format;
    this.read = new RenderTarget(gl, format, width, height);
    this.write = new RenderTarget(gl, format, width, height);
  }

  get width() {
    return this.read.width;
  }

  get height() {
    return this.read.height;
  }

  swap() {
    const t = this.read;
    this.read = this.write;
    this.write = t;
    return this;
  }

  clear(r, g, b, a) {
    this.read.clear(r, g, b, a);
    this.write.clear(r, g, b, a);
    return this;
  }
  
  // Reallocate both halves; `blit` (optional) is called as blit(srcTarget, dstTarget)
  // so callers can preserve contents across a resolution change.
  resize(width, height, blit, order) {
    if (this.read.width === width && this.read.height === height) return this;
    const oldRead = this.read;
    const oldWrite = this.write;
    const nextRead = new RenderTarget(this.gl, this.format, width, height);
    const nextWrite = new RenderTarget(this.gl, this.format, width, height);
    if (blit) {
      blit(oldRead, nextRead);
      blit(oldWrite || oldRead, nextWrite);
    }
    oldRead.dispose();
    oldWrite.dispose();
    this.read = nextRead;
    this.write = nextWrite;
    return this;
  }

  dispose() {
    this.read.dispose();
    this.write.dispose();
  }
}