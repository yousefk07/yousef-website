/* WebGL2 renderer: chunk meshes, sky, sun/moon, clouds, selection box, held block. */
(function (global) {
  'use strict';

  var VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec2 aUV;
  layout(location=2) in float aLight;
  uniform mat4 uVP;
  uniform vec3 uOffset;
  uniform mat3 uRot; // identity, except for the held block
  uniform float uTime;
  uniform float uWave;
  out vec2 vUV;
  out float vLight;
  out vec3 vWorld;
  void main() {
    vec3 p = uRot * aPos + uOffset;
    if (uWave > 0.5) p.y += sin(p.x * 0.7 + uTime * 1.6) * 0.035 + sin(p.z * 0.9 + uTime * 1.3) * 0.035;
    vUV = aUV;
    vLight = aLight;
    vWorld = p;
    gl_Position = uVP * vec4(p, 1.0);
  }`;

  var FS = `#version 300 es
  precision highp float;
  in vec2 vUV;
  in float vLight;
  in vec3 vWorld;
  uniform sampler2D uTex;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uAlpha;
  uniform float uDaylight;
  uniform vec3 uCam;
  uniform float uTint;
  out vec4 outColor;
  void main() {
    vec4 t = texture(uTex, vUV);
    if (t.a < 0.35) discard;
    float light = mix(0.22, 1.0, uDaylight) * vLight;
    vec3 col = t.rgb * light;
    float d = length(vWorld - uCam);
    float f = clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    col = mix(col, uFogColor, f);
    outColor = vec4(col, t.a * uAlpha);
  }`;

  var SKY_VS = `#version 300 es
  layout(location=0) in vec2 aPos;
  out vec2 vP;
  void main() { vP = aPos; gl_Position = vec4(aPos, 1.0, 1.0); }`;
  var SKY_FS = `#version 300 es
  precision highp float;
  in vec2 vP;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uSunDir;
  uniform float uNight;
  uniform vec2 uRes;
  out vec4 outColor;
  void main() {
    float h = vP.y * 0.5 + 0.5;
    vec3 col = mix(uBottom, uTop, pow(clamp(h, 0.0, 1.0), 0.7));
    // sun glow
    vec2 p = vP * vec2(uRes.x / uRes.y, 1.0);
    float sun = max(0.0, dot(normalize(vec3(p, 0.6)), normalize(uSunDir)));
    col += vec3(1.0, 0.85, 0.55) * pow(sun, 24.0) * 0.55 * (1.0 - uNight);
    // stars
    if (uNight > 0.05) {
      vec2 g = floor(vP * 220.0);
      float s = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
      if (s > 0.9975) col += vec3(0.9) * uNight * (0.5 + 0.5 * sin(s * 100.0));
    }
    outColor = vec4(col, 1.0);
  }`;

  var LINE_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  uniform mat4 uVP;
  uniform vec3 uOffset;
  uniform vec3 uScale;
  void main() { gl_Position = uVP * vec4(aPos * uScale + uOffset, 1.0); }`;
  var LINE_FS = `#version 300 es
  precision highp float;
  uniform vec4 uColor;
  out vec4 outColor;
  void main() { outColor = uColor; }`;

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  // ---- mat4 helpers (column-major) ----
  function perspective(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }
  function mul(out, a, b) {
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return out;
  }
  function view(out, eye, yaw, pitch) {
    // rotate world by -yaw around Y, -pitch around X, then translate by -eye
    var cy = Math.cos(-yaw), sy = Math.sin(-yaw), cp = Math.cos(-pitch), sp = Math.sin(-pitch);
    // R = Rx(-pitch) * Ry(-yaw)
    var r00 = cy, r01 = 0, r02 = sy;
    var r10 = sp * sy, r11 = cp, r12 = -sp * cy;
    var r20 = -cp * sy, r21 = sp, r22 = cp * cy; // +sp: a minus here sheared the view when looking up or down
    out[0] = r00; out[1] = r10; out[2] = r20; out[3] = 0;
    out[4] = r01; out[5] = r11; out[6] = r21; out[7] = 0;
    out[8] = r02; out[9] = r12; out[10] = r22; out[11] = 0;
    out[12] = -(r00 * eye[0] + r01 * eye[1] + r02 * eye[2]);
    out[13] = -(r10 * eye[0] + r11 * eye[1] + r12 * eye[2]);
    out[14] = -(r20 * eye[0] + r21 * eye[1] + r22 * eye[2]);
    out[15] = 1;
    return out;
  }

  function Renderer(canvas) {
    var gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.canvas = canvas;
    this.prog = program(gl, VS, FS);
    this.skyProg = program(gl, SKY_VS, SKY_FS);
    this.lineProg = program(gl, LINE_VS, LINE_FS);
    this.u = {};
    ['uVP', 'uOffset', 'uRot', 'uTime', 'uWave', 'uTex', 'uFogColor', 'uFogNear', 'uFogFar', 'uAlpha', 'uDaylight', 'uCam', 'uTint'].forEach(function (n) {
      this.u[n] = gl.getUniformLocation(this.prog, n);
    }, this);
    this.su = {};
    ['uTop', 'uBottom', 'uSunDir', 'uNight', 'uRes'].forEach(function (n) {
      this.su[n] = gl.getUniformLocation(this.skyProg, n);
    }, this);
    this.lu = {};
    ['uVP', 'uOffset', 'uScale', 'uColor'].forEach(function (n) {
      this.lu[n] = gl.getUniformLocation(this.lineProg, n);
    }, this);

    // atlas texture
    var atlas = global.Textures.atlas();
    this.atlas = atlas;
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    // No mipmaps: the atlas packs many tiles side by side, so lower mip levels
    // blend neighbouring tiles together (the stretched/corrupted look at distance).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tex = tex;

    // sky quad
    this.skyVao = gl.createVertexArray();
    gl.bindVertexArray(this.skyVao);
    var sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // line box (unit cube edges)
    var e = [];
    var C = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]];
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(function (p) {
      e.push(C[p[0]][0], C[p[0]][1], C[p[0]][2], C[p[1]][0], C[p[1]][1], C[p[1]][2]);
    });
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    var lb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(e), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.vp = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.viewM = new Float32Array(16);
    this.tmp = new Float32Array(16);
    this.stats = { chunks: 0, tris: 0 };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  Renderer.prototype.upload = function (chunk, data) {
    var gl = this.gl;
    function make(arr) {
      if (!arr.length) return null;
      var vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      var stride = 7 * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
      gl.bindVertexArray(null);
      return { vao: vao, buf: buf, count: arr.length / 7 };
    }
    this.free(chunk);
    chunk.mesh = make(data.solid);
    chunk.meshWater = make(data.water);
  };

  Renderer.prototype.free = function (chunk) {
    var gl = this.gl;
    [chunk.mesh, chunk.meshWater].forEach(function (m) {
      if (m) { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.buf); }
    });
    chunk.mesh = null; chunk.meshWater = null;
  };

  Renderer.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.aspect = w / Math.max(1, h);
  };

  // sky colours by time of day (t in 0..1, 0 = sunrise)
  function skyColors(t) {
    // keyframes: day, sunset, night, dawn
    var K = [
      { t: 0.00, top: [0.35, 0.45, 0.75], bot: [0.95, 0.65, 0.45], light: 0.55 },
      { t: 0.10, top: [0.35, 0.58, 0.95], bot: [0.70, 0.85, 1.00], light: 0.95 },
      { t: 0.45, top: [0.30, 0.55, 0.95], bot: [0.70, 0.85, 1.00], light: 1.00 },
      { t: 0.55, top: [0.30, 0.50, 0.90], bot: [0.95, 0.70, 0.45], light: 0.85 },
      { t: 0.62, top: [0.10, 0.12, 0.28], bot: [0.45, 0.30, 0.35], light: 0.45 },
      { t: 0.75, top: [0.02, 0.03, 0.10], bot: [0.06, 0.08, 0.18], light: 0.22 },
      { t: 0.92, top: [0.02, 0.03, 0.10], bot: [0.06, 0.08, 0.18], light: 0.22 },
      { t: 1.00, top: [0.35, 0.45, 0.75], bot: [0.95, 0.65, 0.45], light: 0.55 }
    ];
    for (var i = 0; i < K.length - 1; i++) {
      if (t >= K[i].t && t <= K[i + 1].t) {
        var a = K[i], b = K[i + 1];
        var f = (t - a.t) / (b.t - a.t);
        function mix3(p, q) { return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]; }
        return { top: mix3(a.top, b.top), bot: mix3(a.bot, b.bot), light: a.light + (b.light - a.light) * f };
      }
    }
    return { top: [0.3, 0.55, 0.95], bot: [0.7, 0.85, 1], light: 1 };
  }
  Renderer.skyColors = skyColors;

  Renderer.prototype.render = function (cam, world, opts) {
    var gl = this.gl;
    this.resize();
    var sky = skyColors(opts.time);
    var night = Math.max(0, Math.min(1, (0.75 - sky.light) / 0.5));
    var fog = sky.bot.map(function (c) { return c * (0.35 + 0.65 * sky.light); });
    var fogFar = opts.fogFar || 110;
    var fogNear = fogFar * 0.55;

    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // sky
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE); // the full-screen sky triangle is wound either way
    gl.useProgram(this.skyProg);
    var sunAng = opts.time * Math.PI * 2 - Math.PI / 2;
    gl.uniform3f(this.su.uTop, sky.top[0], sky.top[1], sky.top[2]);
    gl.uniform3f(this.su.uBottom, sky.bot[0], sky.bot[1], sky.bot[2]);
    gl.uniform3f(this.su.uSunDir, Math.cos(sunAng) * 0.6, Math.sin(sunAng), 0.5);
    gl.uniform1f(this.su.uNight, night);
    gl.uniform2f(this.su.uRes, this.canvas.width, this.canvas.height);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // camera matrices: near plane far enough out that 24-bit depth keeps
    // neighbouring chunks apart at distance (0.05 caused z-fighting slices)
    perspective(this.proj, cam.fov * Math.PI / 180, this.aspect, 0.1, 600);
    view(this.viewM, cam.pos, cam.yaw, cam.pitch);
    mul(this.vp, this.proj, this.viewM);

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u.uTex, 0);
    gl.uniformMatrix4fv(this.u.uVP, false, this.vp);
    gl.uniformMatrix3fv(this.u.uRot, false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.uniform3f(this.u.uFogColor, fog[0], fog[1], fog[2]);
    gl.uniform1f(this.u.uFogNear, fogNear);
    gl.uniform1f(this.u.uFogFar, fogFar);
    gl.uniform1f(this.u.uDaylight, sky.light);
    gl.uniform3f(this.u.uCam, cam.pos[0], cam.pos[1], cam.pos[2]);
    gl.uniform1f(this.u.uTime, opts.clock || 0);
    gl.uniform1f(this.u.uTint, 1);

    var self = this;
    var tris = 0, drawn = 0;
    var visible = [];
    world.chunks.forEach(function (c) {
      if (!c.generated || (!c.mesh && !c.meshWater)) return;
      var cx = c.cx * 16 + 8, cz = c.cz * 16 + 8;
      var dx = cx - cam.pos[0], dz = cz - cam.pos[2];
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > fogFar + 24) return;
      visible.push({ c: c, d: d });
    });
    visible.sort(function (a, b) { return a.d - b.d; });

    // opaque
    gl.disable(gl.BLEND);
    gl.uniform1f(this.u.uWave, 0);
    gl.uniform1f(this.u.uAlpha, 1);
    for (var i = 0; i < visible.length; i++) {
      var m = visible[i].c.mesh;
      if (!m) continue;
      gl.uniform3f(this.u.uOffset, 0, 0, 0);
      gl.bindVertexArray(m.vao);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
      tris += m.count / 3; drawn++;
    }

    // selection box
    if (opts.selection) {
      var s = opts.selection;
      gl.useProgram(this.lineProg);
      gl.uniformMatrix4fv(this.lu.uVP, false, this.vp);
      gl.uniform3f(this.lu.uOffset, s.x - 0.002, s.y - 0.002, s.z - 0.002);
      gl.uniform3f(this.lu.uScale, 1.004, 1.004, 1.004);
      gl.uniform4f(this.lu.uColor, 0, 0, 0, 0.75);
      gl.bindVertexArray(this.lineVao);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.u.uVP, false, this.vp);
    }

    // water (translucent, back to front)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(this.u.uWave, 1);
    gl.uniform1f(this.u.uAlpha, 0.72);
    for (var j = visible.length - 1; j >= 0; j--) {
      var w = visible[j].c.meshWater;
      if (!w) continue;
      gl.uniform3f(this.u.uOffset, 0, 0, 0);
      gl.bindVertexArray(w.vao);
      gl.drawArrays(gl.TRIANGLES, 0, w.count);
      tris += w.count / 3;
    }
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // held block (drawn last, own depth range)
    if (opts.held && opts.held.mesh) {
      var h = opts.held;
      this.lastHeld = h;
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.uniform1f(this.u.uWave, 0);
      gl.uniform1f(this.u.uAlpha, 1);
      // in the camera's own space (the projection alone), tilted to show its top and two sides, so it stays put on
      // screen whichever way you look
      var cyy = Math.cos(h.rotY), syy = Math.sin(h.rotY), cxx = Math.cos(h.rotX), sxx = Math.sin(h.rotX);
      gl.uniformMatrix3fv(this.u.uRot, false, [cyy, sxx * syy, -cxx * syy, 0, cxx, sxx, syy, -sxx * cyy, cxx * cyy]); // Rx * Ry
      gl.uniformMatrix4fv(this.u.uVP, false, this.proj);
      gl.uniform3f(this.u.uOffset, h.x, h.y, h.z);
      gl.uniform1f(this.u.uFogNear, 1000);
      gl.uniform1f(this.u.uFogFar, 2000);
      gl.bindVertexArray(h.mesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, h.mesh.count);
      gl.uniform1f(this.u.uFogNear, fogNear);
      gl.uniform1f(this.u.uFogFar, fogFar);
      gl.uniformMatrix4fv(this.u.uVP, false, this.vp);
      gl.uniformMatrix3fv(this.u.uRot, false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
    }
    gl.bindVertexArray(null);
    this.stats.chunks = drawn;
    this.stats.tris = tris;
  };

  Renderer.prototype.makeMesh = function (arr) {
    var gl = this.gl;
    if (!arr.length) return null;
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    var stride = 7 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
    gl.bindVertexArray(null);
    return { vao: vao, buf: buf, count: arr.length / 7 };
  };

  global.Renderer = Renderer;
  global.Mat4 = { perspective: perspective, mul: mul, view: view };
})(window);
