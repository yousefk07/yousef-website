/* Main: game loop, input, chunk streaming, interaction, saving. */
(function (global) {
  'use strict';
  var Blocks = global.Blocks;
  var CH = 16, HEIGHT = 128;
  var SAVE_KEY = 'blockcraft.save.v1';

  var canvas = document.getElementById('gl');
  var renderer, world, player, ui, gen;
  var state = 'start'; // start | playing | paused | picker
  var keys = {};
  var mouse = { left: false, right: false };
  var time = 0.28;           // day time 0..1
  var DAY_LENGTH = 480;      // seconds for a full cycle
  var clock = 0;
  var last = 0;
  var fps = 0, frames = 0, fpsTimer = 0;
  var hotbar = [2, 3, 1, 4, 5, 7, 8, 6, 10];
  var sel = 0;
  var breaking = null;       // {x,y,z,progress}
  var placeCooldown = 0;
  var swing = 0;
  var heldMesh = null, heldId = -1;
  var particles = [];
  var seed = 0;
  var showDebug = true;
  var meshQueue = [];
  var lastSpaceTap = 0;

  function hashSeed(s) {
    s = String(s).trim();
    if (/^-?\d+$/.test(s)) return parseInt(s, 10) | 0;
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // ---------------------------------------------------------------- world setup
  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function startWorld(sd, edits) {
    seed = sd;
    gen = global.WorldGen.create(sd);
    world = new global.World(sd, gen);
    if (edits) world.loadEdits(edits);
    player = new global.Player(world);
    // find a spawn point on land
    var sx = 0, sz = 0;
    for (var r = 0; r < 64; r++) {
      var h = gen.columnHeight(sx, sz);
      if (h > global.WorldGen.SEA_LEVEL + 1) break;
      sx += 8; sz += 3;
    }
    player.pos = [sx + 0.5, gen.columnHeight(sx, sz) + 2.2, sz + 0.5];
    player.yaw = 0.6; player.pitch = -0.15;
    meshQueue = [];
    world.chunks.forEach(function (c) { renderer.free(c); });
    world.chunks.clear();
    heldId = -1;
    document.getElementById('seedInput').value = String(sd);
  }

  function chunkDist(cx, cz) {
    var px = player.pos[0] / CH, pz = player.pos[2] / CH;
    return Math.hypot(cx + 0.5 - px, cz + 0.5 - pz);
  }

  var RENDER_DIST = 8;

  function streamChunks(budgetMs) {
    var t0 = performance.now();
    var pcx = Math.floor(player.pos[0] / CH), pcz = Math.floor(player.pos[2] / CH);
    // generate nearest missing chunks
    var need = [];
    for (var dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
      for (var dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
        var cx = pcx + dx, cz = pcz + dz;
        if (dx * dx + dz * dz > (RENDER_DIST + 0.5) * (RENDER_DIST + 0.5)) continue;
        var c = world.chunks.get(world.key(cx, cz));
        if (!c || !c.generated) need.push([cx, cz, dx * dx + dz * dz]);
      }
    }
    need.sort(function (a, b) { return a[2] - b[2]; });
    for (var i = 0; i < need.length; i++) {
      if (performance.now() - t0 > budgetMs * 0.5) break;
      world.generate(need[i][0], need[i][1]);
    }
    // mesh dirty chunks nearest first
    var dirty = [];
    world.chunks.forEach(function (c) {
      if (c.generated && c.dirty) dirty.push(c);
    });
    dirty.sort(function (a, b) { return chunkDist(a.cx, a.cz) - chunkDist(b.cx, b.cz); });
    for (var j = 0; j < dirty.length; j++) {
      if (performance.now() - t0 > budgetMs) break;
      var ch = dirty[j];
      // only mesh when all 4 neighbours are generated (avoids edge faces)
      var ok = true;
      for (var k = 0; k < 4; k++) {
        var nx = ch.cx + [1, -1, 0, 0][k], nz = ch.cz + [0, 0, 1, -1][k];
        var nc = world.chunks.get(world.key(nx, nz));
        if (!nc || !nc.generated) { ok = false; break; }
      }
      if (!ok) continue;
      var data = global.Mesher.meshChunk(world, ch);
      renderer.upload(ch, data);
      ch.dirty = false;
    }
    // unload far chunks
    if (frames % 60 === 0) {
      var far = [];
      world.chunks.forEach(function (c) {
        if (chunkDist(c.cx, c.cz) > RENDER_DIST + 3) far.push(c);
      });
      far.forEach(function (c) {
        if (world.modified.has(world.key(c.cx, c.cz))) return;
        renderer.free(c);
        world.chunks.delete(world.key(c.cx, c.cz));
      });
    }
  }

  // ---------------------------------------------------------------- interaction
  function materialOf(id) {
    var b = Blocks.list[id];
    if (!b) return 'stone';
    return b.sound || 'stone';
  }

  function spawnParticles(x, y, z, id, n) {
    var col = global.Textures.avgColor(Blocks.list[id].tex.side);
    for (var i = 0; i < n; i++) {
      particles.push({
        x: x + 0.5 + (Math.random() - 0.5) * 0.8,
        y: y + 0.5 + (Math.random() - 0.5) * 0.8,
        z: z + 0.5 + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 1, vz: (Math.random() - 0.5) * 3,
        life: 0.6 + Math.random() * 0.4, col: col, size: 0.08 + Math.random() * 0.06
      });
    }
  }

  function breakBlock(x, y, z) {
    var id = world.getBlock(x, y, z);
    if (id <= 0) return;
    var b = Blocks.list[id];
    if (!b || b.hardness === Infinity) return;
    world.setBlock(x, y, z, 0);
    spawnParticles(x, y, z, id, 14);
    if (global.Sound) global.Sound.breakBlock(materialOf(id));
    swing = 1;
  }

  function placeBlock(x, y, z, id) {
    if (player.intersectsBlock(x, y, z)) return false;
    var cur = world.getBlock(x, y, z);
    if (cur > 0 && !Blocks.list[cur].cross && cur !== 9) return false;
    if (!world.setBlock(x, y, z, id)) return false;
    if (global.Sound) global.Sound.placeBlock(materialOf(id));
    swing = 1;
    return true;
  }

  function updateInteraction(dt) {
    var hit = player.raycast(5);
    var target = hit ? { x: hit.x, y: hit.y, z: hit.z } : null;
    if (mouse.left && hit) {
      var id = hit.id;
      var b = Blocks.list[id];
      if (!breaking || breaking.x !== hit.x || breaking.y !== hit.y || breaking.z !== hit.z) {
        breaking = { x: hit.x, y: hit.y, z: hit.z, progress: 0, soundT: 0 };
      }
      var hardness = Math.max(0.05, b.hardness || 0.5);
      breaking.progress += dt / hardness;
      breaking.soundT -= dt;
      if (breaking.soundT <= 0) {
        breaking.soundT = 0.22;
        if (global.Sound) global.Sound.hit(materialOf(id));
        spawnParticles(hit.x, hit.y, hit.z, id, 2);
        swing = Math.max(swing, 0.6);
      }
      if (breaking.progress >= 1) {
        breakBlock(hit.x, hit.y, hit.z);
        breaking = null;
      }
    } else {
      breaking = null;
    }
    placeCooldown -= dt;
    if (mouse.right && hit && placeCooldown <= 0) {
      var px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
      if (placeBlock(px, py, pz, hotbar[sel])) placeCooldown = 0.22;
      else placeCooldown = 0.12;
    }
    return { hit: hit, target: target };
  }

  function pickBlock(hit) {
    if (!hit) return;
    var id = hit.id;
    var i = hotbar.indexOf(id);
    if (i >= 0) sel = i;
    else { hotbar[sel] = id; }
    ui.setHotbar(hotbar, sel);
    ui.showName(id);
  }

  // ---------------------------------------------------------------- held item
  // where the held block sits in the camera's own space (x right, y up, -z ahead): the bottom-right of the view
  // whichever way you look, with the walking bob and the swing
  function heldTransform() {
    var bobX = Math.sin(player.walkDist * 2.2) * 0.02;
    var bobY = Math.abs(Math.cos(player.walkDist * 2.2)) * 0.02;
    var sw = Math.sin(swing * Math.PI);
    return { x: 1.25 + bobX - sw * 0.2, y: -0.72 + bobY + sw * 0.15, z: -1.6 - sw * 0.15, rotY: -0.75 + sw * 0.5, rotX: 0.32 - sw * 0.6 };
  }

  function heldMeshFor(id) {
    if (id === heldId) return heldMesh;
    heldId = id;
    if (heldMesh) { renderer.gl.deleteVertexArray(heldMesh.vao); renderer.gl.deleteBuffer(heldMesh.buf); heldMesh = null; }
    if (!id) return null;
    var fake = { cx: 0, cz: 0, blocks: new Uint8Array(CH * CH * HEIGHT), generated: true };
    fake.blocks[(64 * CH + 8) * CH + 8] = id;
    var fakeWorld = {
      getBlockMesh: function (x, y, z) {
        if (x === 8 && y === 64 && z === 8) return id;
        return 0;
      }
    };
    var data = global.Mesher.meshChunk(fakeWorld, fake);
    var arr = data.solid;
    // centre the cube at origin and scale
    var s = 0.42;
    for (var i = 0; i < arr.length; i += 7) {
      arr[i] = (arr[i] - 8.5) * s;
      arr[i + 1] = (arr[i + 1] - 64.5) * s;
      arr[i + 2] = (arr[i + 2] - 8.5) * s;
    }
    heldMesh = renderer.makeMesh(arr);
    return heldMesh;
  }

  // ---------------------------------------------------------------- input
  function onKey(e, down) {
    var code = e.code;
    if (down && ['Space', 'Tab', 'F3', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'].indexOf(code) >= 0) e.preventDefault();
    keys[code] = down;
    if (!down) return;
    if (state === 'playing') {
      if (code === 'Escape') { pause(); return; }
      if (code === 'KeyE') { openPicker(); return; }
      if (code === 'KeyF') { player.flying = !player.flying; player.vel[1] = 0; ui.toast(player.flying ? 'Flight: ON' : 'Flight: OFF'); return; }
      if (code === 'KeyM') { if (global.Sound) { global.Sound.toggleMute(); ui.toast(global.Sound.isMuted() ? 'Sound muted' : 'Sound on'); } return; }
      if (code === 'F3') { showDebug = !showDebug; return; }
      if (code === 'Space') {
        var now = performance.now();
        if (now - lastSpaceTap < 280) {
          player.flying = !player.flying;
          player.vel[1] = 0;
          ui.toast(player.flying ? 'Flight: ON' : 'Flight: OFF');
        }
        lastSpaceTap = now;
      }
      if (code.indexOf('Digit') === 0) {
        var n = +code.slice(5);
        if (n >= 1 && n <= 9) { sel = n - 1; ui.setHotbar(hotbar, sel); ui.showName(hotbar[sel]); }
      }
    } else if (state === 'picker') {
      if (code === 'KeyE' || code === 'Escape') closePicker();
    } else if (state === 'paused') {
      if (code === 'Escape') resume();
    }
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    document.getElementById('pause').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function resume() {
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('picker').classList.add('hidden');
    state = 'playing';
    canvas.requestPointerLock();
  }
  function openPicker() {
    state = 'picker';
    ui.showPicker(true);
    if (document.pointerLockElement) document.exitPointerLock();
    if (global.Sound) global.Sound.open();
  }
  function closePicker() {
    ui.showPicker(false);
    state = 'playing';
    canvas.requestPointerLock();
  }

  function bindInput() {
    document.addEventListener('keydown', function (e) { onKey(e, true); });
    document.addEventListener('keyup', function (e) { onKey(e, false); });
    document.addEventListener('mousemove', function (e) {
      if (state !== 'playing') return;
      var s = 0.0022;
      player.yaw -= e.movementX * s;
      player.pitch -= e.movementY * s;
      var lim = Math.PI / 2 - 0.001;
      player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
    });
    canvas.addEventListener('mousedown', function (e) {
      if (state !== 'playing') return;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
      if (e.button === 0) mouse.left = true;
      if (e.button === 2) mouse.right = true;
      if (e.button === 1) { e.preventDefault(); pickBlock(player.raycast(5)); }
    });
    document.addEventListener('mouseup', function (e) {
      if (e.button === 0) mouse.left = false;
      if (e.button === 2) mouse.right = false;
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('wheel', function (e) {
      if (state !== 'playing') return;
      sel = (sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
      ui.setHotbar(hotbar, sel);
      ui.showName(hotbar[sel]);
    }, { passive: true });
    document.addEventListener('pointerlockchange', function () {
      if (!document.pointerLockElement && state === 'playing') pause();
    });
    document.getElementById('playBtn').addEventListener('click', function () {
      if (global.Sound) global.Sound.init();
      var v = document.getElementById('seedInput').value;
      var sd = hashSeed(v || String(Math.floor(Math.random() * 1e9)));
      var save = loadSave();
      if (!world || seed !== sd) {
        if (save && save.seed === sd) startWorld(sd, save.edits);
        else startWorld(sd, null);
      }
      document.getElementById('start').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
      state = 'playing';
      canvas.requestPointerLock();
      ui.setHotbar(hotbar, sel);
      ui.showName(hotbar[sel]);
    });
    document.getElementById('newWorldBtn').addEventListener('click', function () {
      document.getElementById('seedInput').value = String(Math.floor(Math.random() * 1e9));
    });
    document.getElementById('resumeBtn').addEventListener('click', resume);
    document.getElementById('saveBtn').addEventListener('click', function () { saveWorld(); ui.toast('World saved'); });
    document.getElementById('resetBtn').addEventListener('click', function () {
      localStorage.removeItem(SAVE_KEY);
      startWorld(seed, null);
      ui.toast('World reset');
    });
    ui.onPick = function (id) {
      hotbar[sel] = id;
      ui.setHotbar(hotbar, sel);
      ui.showName(id);
      closePicker();
    };
  }

  function saveWorld() {
    if (!world) return;
    try {
      var d = world.serialize();
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    } catch (e) { /* storage full */ }
  }

  // ---------------------------------------------------------------- particles
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy -= 18 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) > 0) { p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; p.y += 0.02; }
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    if (!particles.length) return;
    var ctx = overlayCtx;
    var eye = player.eye();
    var cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    var fwd = [-Math.sin(player.yaw) * cp, sp, -Math.cos(player.yaw) * cp];
    var right = [Math.cos(player.yaw), 0, -Math.sin(player.yaw)];
    var up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    var W = overlay.width, H = overlay.height;
    var f = (H / 2) / Math.tan(player.fov * Math.PI / 360);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var dx = p.x - eye[0], dy = p.y - eye[1], dz = p.z - eye[2];
      var zc = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
      if (zc < 0.1) continue;
      var xc = dx * right[0] + dy * right[1] + dz * right[2];
      var yc = dx * up[0] + dy * up[1] + dz * up[2];
      var sx = W / 2 + xc / zc * f, sy = H / 2 - yc / zc * f;
      var sz = Math.max(2, p.size / zc * f);
      ctx.fillStyle = 'rgb(' + p.col[0] + ',' + p.col[1] + ',' + p.col[2] + ')';
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- overlay (cracks, particles)
  var overlay, overlayCtx;
  function drawOverlay(hit) {
    var ctx = overlayCtx;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (breaking && breaking.progress > 0.02) {
      var stage = Math.min(9, Math.floor(breaking.progress * 10));
      var img = global.Textures.breakStage(stage);
      // project the 8 corners of the block and draw the crack texture on the front face
      var eye = player.eye();
      var cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
      var fwd = [-Math.sin(player.yaw) * cp, sp, -Math.cos(player.yaw) * cp];
      var right = [Math.cos(player.yaw), 0, -Math.sin(player.yaw)];
      var up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
      var W = overlay.width, H = overlay.height;
      // the overlay is sized in device pixels, so the focal length must use the
      // same aspect ratio as the GL view (canvas.width / canvas.height)
      var f = (H / 2) / Math.tan(player.fov * Math.PI / 360);
      function proj(x, y, z) {
        var dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
        var zc = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
        if (zc < 0.05) zc = 0.05;
        return [W / 2 + (dx * right[0] + dy * right[1] + dz * right[2]) / zc * f,
                H / 2 - (dx * up[0] + dy * up[1] + dz * up[2]) / zc * f];
      }
      var b = breaking;
      var faces = global.Mesher.FACES;
      for (var fi = 0; fi < 6; fi++) {
        var F = faces[fi];
        var c0 = F.c[0], c1 = F.c[1], c2 = F.c[2], c3 = F.c[3];
        var p0 = proj(b.x + c0[0], b.y + c0[1], b.z + c0[2]);
        var p1 = proj(b.x + c1[0], b.y + c1[1], b.z + c1[2]);
        var p2 = proj(b.x + c2[0], b.y + c2[1], b.z + c2[2]);
        var p3 = proj(b.x + c3[0], b.y + c3[1], b.z + c3[2]);
        // only draw faces roughly facing the camera
        var nx = F.n[0], ny = F.n[1], nz = F.n[2];
        var cx = b.x + 0.5 + nx * 0.5 - eye[0], cy = b.y + 0.5 + ny * 0.5 - eye[1], cz = b.z + 0.5 + nz * 0.5 - eye[2];
        if (nx * cx + ny * cy + nz * cz > 0) continue;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]);
        ctx.closePath();
        ctx.clip();
        // affine map image onto the quad (approximate with the first 3 corners)
        var ux = p1[0] - p0[0], uy = p1[1] - p0[1];
        var vx = p3[0] - p0[0], vy = p3[1] - p0[1];
        ctx.setTransform(ux / 16, uy / 16, vx / 16, vy / 16, p0[0], p0[1]);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      }
    }
    drawParticles();
  }

  // ---------------------------------------------------------------- loop
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    if (overlay && (overlay.width !== canvas.width || overlay.height !== canvas.height)) {
      overlay.width = canvas.width; overlay.height = canvas.height;
    }
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) { fps = Math.round(frames / fpsTimer); frames = 0; fpsTimer = 0; }
    if (state === 'start' || !world) return;
    clock += dt;
    var playing = state === 'playing';
    if (playing) {
      time = (time + dt / DAY_LENGTH) % 1;
      var input = {
        forward: keys.KeyW || keys.ArrowUp, back: keys.KeyS || keys.ArrowDown,
        left: keys.KeyA || keys.ArrowLeft, right: keys.KeyD || keys.ArrowRight,
        jump: keys.Space, sneak: keys.ShiftLeft || keys.ShiftRight
      };
      player.sneaking = !!(keys.ShiftLeft || keys.ShiftRight) && !player.flying;
      player.sprinting = !!(keys.ControlLeft || keys.ControlRight) && input.forward;
      player.update(dt, input);
      updateParticles(dt);
      swing = Math.max(0, swing - dt * 4);
    }
    streamChunks(playing ? 6 : 10);
    var inter = playing ? updateInteraction(dt) : { hit: null };
    ui.update(dt);
    ui.setUnderwater(player.headInWater);

    // render
    var eye = player.eye();
    var cam = { pos: [eye[0], eye[1] + player.bob, eye[2]], yaw: player.yaw, pitch: player.pitch, fov: player.fov + (player.sprinting ? 6 : 0) };
    var held = null;
    var hm = heldMeshFor(hotbar[sel]);
    if (hm) {
      var t = heldTransform();
      held = { mesh: hm, x: t.x, y: t.y, z: t.z, rotX: t.rotX, rotY: t.rotY };
    }
    renderer.render(cam, world, {
      time: time,
      clock: clock,
      selection: inter.hit ? { x: inter.hit.x, y: inter.hit.y, z: inter.hit.z } : null,
      held: held,
      fogFar: RENDER_DIST * CH - 10
    });
    drawOverlay(inter.hit);

    // HUD info
    if (showDebug) {
      var p = player.pos;
      var hh = Math.floor((time * 24 + 6) % 24), mm = Math.floor(((time * 24 + 6) % 1) * 60);
      ui.setInfo(
        'Blockcraft  ' + fps + ' fps\n' +
        'XYZ ' + p[0].toFixed(1) + ' / ' + p[1].toFixed(1) + ' / ' + p[2].toFixed(1) + '\n' +
        'Seed ' + seed + '   Time ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + '\n' +
        (player.flying ? 'Flying' : (player.sprinting ? 'Sprinting' : (player.sneaking ? 'Sneaking' : 'Walking'))) +
        '   Chunks ' + renderer.stats.chunks + '   Tris ' + Math.round(renderer.stats.tris / 1000) + 'k'
      );
    } else ui.setInfo('');
  }

  function init() {
    renderer = new global.Renderer(canvas);
    ui = new global.UI();
    overlay = document.createElement('canvas');
    overlay.id = 'overlay';
    overlay.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;';
    document.body.insertBefore(overlay, document.getElementById('hud'));
    overlayCtx = overlay.getContext('2d');
    function sizeOverlay() {
      // match the GL canvas' drawing-buffer size, not its CSS size: on a HiDPI
      // screen the overlay was half resolution and its content landed in the
      // wrong place (the "sliced / corrupted" strips over the terrain)
      overlay.width = canvas.width; overlay.height = canvas.height;
    }
    // the GL canvas is resized by the renderer every frame, so re-check the
    // overlay size each frame too (a one-off resize left it at 300x150)
    global.addEventListener('resize', sizeOverlay);
    bindInput();
    // the world is created on Play (see playBtn); only the seed is shown here
    var save = loadSave();
    var sd = save ? save.seed : hashSeed('blockcraft');
    document.getElementById('seedInput').value = String(sd);
    global.addEventListener('beforeunload', saveWorld);
    setInterval(saveWorld, 20000);
    requestAnimationFrame(frame);
    global.Game = {
      get world() { return world; }, get player() { return player; }, get renderer() { return renderer; },
      get state() { return state; }, get time() { return time; }, set time(v) { time = v; },
      get seed() { return seed; }, hotbar: hotbar, get sel() { return sel; },
      get breaking() { return breaking; }, get particles() { return particles; },
      save: saveWorld, startWorld: startWorld
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
