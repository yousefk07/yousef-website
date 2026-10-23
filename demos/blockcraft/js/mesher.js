/* Chunk mesher: builds only visible faces into interleaved vertex arrays. */
(function (global) {
  'use strict';
  var CH = 16, HEIGHT = 128;
  var Blocks = global.Blocks;

  // face order: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
  // corners per face (CCW seen from outside), in block-local units
  var FACES = [
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
  ];
  // uv per corner (u right, v down in atlas space)
  var FACE_UV = [
    [[0, 1], [1, 1], [1, 0], [0, 0]],
    [[0, 1], [1, 1], [1, 0], [0, 0]],
    [[0, 1], [1, 1], [1, 0], [0, 0]],
    [[0, 1], [1, 1], [1, 0], [0, 0]],
    [[0, 1], [1, 1], [1, 0], [0, 0]],
    [[0, 1], [1, 1], [1, 0], [0, 0]]
  ];
  var AO = [0.55, 0.72, 0.86, 1.0];

  var uvCache = {};
  function uvOf(name) {
    var u = uvCache[name];
    if (u) return u;
    var t = global.Textures.uv(name);
    if (!t) t = global.Textures.uv('missing') || { u0: 0, v0: 0, u1: 1, v1: 1 };
    // inset half a texel to avoid bleeding between tiles
    var a = global.Textures.atlas();
    var du = 0.5 / a.canvas.width, dv = 0.5 / a.canvas.height;
    u = { u0: t.u0 + du, v0: t.v0 + dv, u1: t.u1 - du, v1: t.v1 - dv };
    uvCache[name] = u;
    return u;
  }

  function faceTex(id, f) {
    var b = Blocks.list[id];
    if (!b) return 'missing';
    var t = b.tex;
    if (f === 2) return t.top;
    if (f === 3) return t.bottom;
    return t.side;
  }

  function isOpaque(id) { return id > 0 && Blocks.list[id] && Blocks.list[id].opaque; }
  // a neighbour that hides the face: opaque, or out of the world (y<0 / y>=HEIGHT)
  // a neighbour that hides the face: opaque, or out of the world (y<0 / y>=HEIGHT).
  // A block id the registry does not know counts as solid, so unknown ids never leave holes.
  function hides(id) { return id === -1 || (id > 0 && (!Blocks.list[id] || Blocks.list[id].opaque !== false)); }
  function isCross(id) { return id > 0 && Blocks.list[id] && Blocks.list[id].cross; }
  function isLiquid(id) { return id === 9 || id === 46 || id === 95; }

  function Grow() {
    this.v = new Float32Array(1 << 16);
    this.n = 0;
  }
  Grow.prototype.push = function (x, y, z, u, v, s, l) {
    if (this.n + 7 > this.v.length) {
      var nv = new Float32Array(this.v.length * 2);
      nv.set(this.v);
      this.v = nv;
    }
    var a = this.v, n = this.n;
    a[n] = x; a[n + 1] = y; a[n + 2] = z; a[n + 3] = u; a[n + 4] = v; a[n + 5] = s; a[n + 6] = l;
    this.n = n + 7;
  };
  Grow.prototype.out = function () { return this.v.slice(0, this.n); };

  // light: 0..1 brightness from sky exposure (simple: exposed to sky = 1)
  function skyLight(world, x, y, z) {
    // cheap: check a few blocks above
    for (var i = 1; i <= 6; i++) {
      var id = world.getBlockMesh(x, y + i, z);
      if (isOpaque(id)) return 0.55;
    }
    return 1;
  }

  function aoAt(world, x, y, z, f, corner) {
    // sample the three neighbours around the corner in the face plane
    var n = FACES[f].n;
    var c = FACES[f].c[corner];
    // corner offsets in the plane: c is 0/1 in the two non-normal axes
    var sx = n[0] !== 0 ? 0 : (c[0] ? 1 : -1);
    var sy = n[1] !== 0 ? 0 : (c[1] ? 1 : -1);
    var sz = n[2] !== 0 ? 0 : (c[2] ? 1 : -1);
    var bx = x + n[0], by = y + n[1], bz = z + n[2];
    var a1, a2;
    if (sx) { a1 = isOpaque(world.getBlockMesh(bx + sx, by, bz)) ? 1 : 0; a2 = isOpaque(world.getBlockMesh(bx, by + sy, bz + sz)) ? 1 : 0; }
    else if (sy) { a1 = isOpaque(world.getBlockMesh(bx + sx, by, bz)) ? 1 : 0; a2 = isOpaque(world.getBlockMesh(bx, by, bz + sz)) ? 1 : 0; }
    else { a1 = isOpaque(world.getBlockMesh(bx + sx, by, bz)) ? 1 : 0; a2 = isOpaque(world.getBlockMesh(bx, by + sy, bz)) ? 1 : 0; }
    var cor = isOpaque(world.getBlockMesh(bx + sx, by + sy, bz + sz)) ? 1 : 0;
    if (a1 && a2) return 0;
    return 3 - (a1 + a2 + cor);
  }

  function meshChunk(world, chunk) {
    var solid = new Grow(), water = new Grow();
    var ox = chunk.cx * CH, oz = chunk.cz * CH;
    var blocks = chunk.blocks;
    var any = false;
    for (var y = 0; y < HEIGHT; y++) {
      for (var z = 0; z < CH; z++) {
        for (var x = 0; x < CH; x++) {
          var id = blocks[(y * CH + z) * CH + x];
          if (id === 0) continue;
          any = true;
          var wx = ox + x, wz = oz + z;
          var b = Blocks.list[id];
          if (!b) continue;
          if (b.cross) {
            var u = uvOf(faceTex(id, 4));
            var l = skyLight(world, wx, y, wz);
            // two crossed quads
            var q = [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.85, 1, 0.85], [0.15, 1, 0.15]];
            var q2 = [[0.85, 0, 0.15], [0.15, 0, 0.85], [0.15, 1, 0.85], [0.85, 1, 0.15]];
            // both quads share the same corner order, so the same UVs fit both
            // drawn as plain triangles (drawArrays), so each quad needs 6 vertices, not 4: 4 knocked every later
            // triangle of the chunk out of step and drew long streaks across the world. Both sides, so a plant
            // shows from any angle.
            [q, q2].forEach(function (quad) {
              [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2].forEach(function (k) {
                solid.push(wx + quad[k][0], y + quad[k][1], wz + quad[k][2],
                  k === 0 || k === 3 ? u.u0 : u.u1, k < 2 ? u.v1 : u.v0, l, 1);
              });
            });
            continue;
          }
          var liquid = isLiquid(id);
          var target = liquid ? water : solid;
          for (var f = 0; f < 6; f++) {
            var n = FACES[f].n;
            var nb = world.getBlockMesh(wx + n[0], y + n[1], wz + n[2]);
            if (nb === id && liquid) continue;
            if (hides(nb)) continue;
            if (liquid && nb !== 0 && !isCross(nb) && !isLiquid(nb)) continue;
            if (!liquid && isLiquid(nb) && f === 2) { /* keep top face under water */ }
            var tex = uvOf(faceTex(id, f));
            var light = liquid ? 1 : skyLight(world, wx + n[0], y + n[1], wz + n[2]);
            var cs = FACES[f].c, fu = FACE_UV[f];
            var ao = [0, 0, 0, 0];
            if (!liquid) for (var k2 = 0; k2 < 4; k2++) ao[k2] = aoAt(world, wx, y, wz, f, k2);
            // flip quad diagonal for smoother AO
            var order = (ao[0] + ao[2] > ao[1] + ao[3]) ? [0, 1, 2, 0, 2, 3] : [1, 2, 3, 1, 3, 0];
            for (var t = 0; t < 6; t++) {
              var ci = order[t];
              var c = cs[ci];
              var uu = fu[ci];
              var yy = y + c[1];
              if (liquid && c[1] === 1 && world.getBlockMesh(wx, y + 1, wz) !== id) yy = y + 0.88;
              target.push(wx + c[0], yy, wz + c[2],
                uu[0] ? tex.u1 : tex.u0, uu[1] ? tex.v1 : tex.v0,
                light * (liquid ? 1 : AO[ao[ci]]), 1);
            }
          }
        }
      }
    }
    chunk.empty = !any;
    return { solid: solid.out(), water: water.out() };
  }

  global.Mesher = { meshChunk: meshChunk, FACES: FACES };
})(window);
