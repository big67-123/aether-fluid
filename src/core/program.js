// aether-fluid :: core/program.js
// Shader compile/link with readable diagnostics, plus a cached uniform setter.

function compile(gl, type, source, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || '(no log)';
    const numbered = source
      .split('\n')
      .map((line, i) => String(i + 1).padStart(4, ' ') + ' | ' + line)
      .join('\n');
    gl.deleteShader(sh);
    throw new Error('[' + label + '] 着色器编译失败:\n' + log + '\n' + numbered);
  }
  return sh;
}

function introspect(gl, handle) {
  const map = new Map();
  const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(handle, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    map.set(name, {
      loc: gl.getUniformLocation(handle, info.name),
      type: info.type,
      size: info.size,
    });
  }
  return map;
}

export class Program {
  // options.varyings: names to capture into a transform feedback buffer.
  // transformFeedbackVaryings() must run before linkProgram(), so it lives here.
  constructor(gl, vsSource, fsSource, label, options) {
    this.gl = gl;
    this.label = label || 'program';
    const opts = options || {};
    const vs = compile(gl, gl.VERTEX_SHADER, vsSource, this.label + ':vs');
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource, this.label + ':fs');
    const handle = gl.createProgram();
    gl.attachShader(handle, vs);
    gl.attachShader(handle, fs);
    if (opts.varyings && opts.varyings.length) {
      gl.transformFeedbackVaryings(handle, opts.varyings, gl.INTERLEAVED_ATTRIBS);
    }
    gl.linkProgram(handle);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(handle) || '(no log)';
      gl.deleteProgram(handle);
      throw new Error('[' + this.label + '] 着色器链接失败:\n' + log);
    }
    this.handle = handle;
    this.uniforms = introspect(gl, handle);
    this._bound = false;
  }

  use() {
    this.gl.useProgram(this.handle);
    return this;
  }

  has(name) {
    return this.uniforms.has(name);
  }

  entry(name) {
    return this.uniforms.get(name) || null;
  }

  // Typed dispatch driven by the introspected uniform type, so call sites stay
  // declarative: p.set('uDt', dt) works for float, vec2, vec3, vec4, int, bool.
  set(name, a, b, c, d) {
    const e = this.uniforms.get(name);
    if (!e) return this;
    const gl = this.gl;
    const loc = e.loc;
    switch (e.type) {
      case gl.FLOAT:
        gl.uniform1f(loc, a);
        break;
      case gl.FLOAT_VEC2:
        if (a && a.length !== undefined) gl.uniform2fv(loc, a);
        else gl.uniform2f(loc, a, b);
        break;
      case gl.FLOAT_VEC3:
        if (a && a.length !== undefined) gl.uniform3fv(loc, a);
        else gl.uniform3f(loc, a, b, c);
        break;
      case gl.FLOAT_VEC4:
        if (a && a.length !== undefined) {
          if (e.size > 1) gl.uniform4fv(loc, a);
          else gl.uniform4fv(loc, a);
        } else {
          gl.uniform4f(loc, a, b, c, d);
        }
        break;
      case gl.SAMPLER_2D:
      case gl.INT_SAMPLER_2D:
      case gl.UNSIGNED_INT_SAMPLER_2D:
        gl.uniform1i(loc, a);
        break;
      case gl.INT:
      case gl.BOOL:
        if (e.size > 1 && a && a.length !== undefined) gl.uniform1iv(loc, a);
        else gl.uniform1i(loc, a);
        break;
      case gl.FLOAT_MAT3:
        gl.uniformMatrix3fv(loc, false, a);
        break;
      case gl.FLOAT_MAT4:
        gl.uniformMatrix4fv(loc, false, a);
        break;
      default:
        break;
    }
    return this;
  }

  dispose() {
    this.gl.deleteProgram(this.handle);
    this.handle = null;
  }
}