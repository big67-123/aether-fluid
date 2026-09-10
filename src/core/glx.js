// aether-fluid :: core/glx.js
// WebGL2 bootstrap + capability probing + renderable-format selection.
// Hand-written, dependency free.

const CONTEXT_ATTRS = {
  alpha: false,
  depth: false,
  stencil: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
  desynchronized: true,
  failIfMajorPerformanceCaveat: false,
};

// Create a 4x4 texture in the candidate format, attach it to an FBO and ask the
// driver whether it is both color-renderable AND linearly filterable. Half-float
// filtering is core in ES 3.0; full-float filtering is not, so we probe instead
// of assuming.
function probeFormat(gl, internalFormat, type) {
  let tex = null;
  let fb = null;
  try {
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, 4, 4);
    if (gl.getError() !== gl.NO_ERROR) return false;
    fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!complete) return false;
    const filter = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER);
    return filter === gl.LINEAR;
  } catch (err) {
    return false;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (fb) gl.deleteFramebuffer(fb);
    if (tex) gl.deleteTexture(tex);
  }
}

function detectFormat(gl) {
  const halfRenderable =
    !!gl.getExtension('EXT_color_buffer_half_float') || !!gl.getExtension('EXT_color_buffer_float');
  const floatRenderable = !!gl.getExtension('EXT_color_buffer_float');

  const candidates = [];
  if (halfRenderable) {
    candidates.push({ name: 'RGBA16F', internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT, bytes: 8, precision: 1 });
  }
  if (floatRenderable) {
    candidates.push({ name: 'RGBA32F', internalFormat: gl.RGBA32F, type: gl.FLOAT, bytes: 16, precision: 2 });
  }
  candidates.push({ name: 'RGBA8', internalFormat: gl.RGBA8, type: gl.UNSIGNED_BYTE, bytes: 4, precision: 0 });

  for (const c of candidates) {
    if (probeFormat(gl, c.internalFormat, c.type)) return c;
  }
  return null;
}

export function createRenderer(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', CONTEXT_ATTRS);
  } catch (err) {
    gl = null;
  }
  if (!gl) return { ok: false, reason: 'no-webgl2' };

  const format = detectFormat(gl);
  if (!format) return { ok: false, reason: 'no-float-target', gl };

  gl.getExtension('OES_texture_float_linear');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  let renderer = 'unknown';
  try {
    renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  } catch (err) {
    renderer = 'unknown';
  }

  const caps = {
    renderer,
    format,
    floatTargets: format.precision > 0,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxTextureUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    timerQuery: null,
  };

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.disable(gl.DITHER);
  gl.colorMask(true, true, true, true);
  gl.clearColor(0, 0, 0, 1);

  return { ok: true, gl, caps };
}

// EXT_disjoint_timer_query_webgl2 exists on desktop Chromium but is deliberately
// absent on iOS Safari. We keep using wall-clock timing; this is only a bonus.
export function tryTimerQuery(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  return ext || null;
}

export function describeFailure(reason) {
  if (reason === 'no-webgl2') {
    return '当前浏览器没有提供 WebGL2 上下文。iOS 15+ Safari / Chrome / Edge 均支持，请在系统设置里确认没有关闭硬件加速。';
  }
  if (reason === 'no-float-target') {
    return '当前的 WebGL2 实现不支持任何可渲染的浮点纹理格式，流体求解器无法运行。';
  }
  return '未知的初始化失败。';
}