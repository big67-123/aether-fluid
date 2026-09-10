// aether-fluid :: core/quad.js
// One fullscreen triangle, zero attributes: positions come from gl_VertexID.
// Three vertices instead of six costs ~33% fewer vertex invocations and removes
// the diagonal quad seam entirely.

export function createFullscreenTriangle(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindVertexArray(null);
  return {
    draw() {
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteVertexArray(vao);
    },
  };
}