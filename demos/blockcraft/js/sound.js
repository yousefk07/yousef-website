/*
 * js/sound.js — Minecraft-like sound effects synthesised with the Web Audio API.
 * No audio files, no network, no dependencies. Self-contained.
 *
 * Usage (from any other script):
 *   Sound.init();                       // call once from a user gesture (click / keydown)
 *   Sound.play('break', { material: 'stone' });
 *   Sound.breakBlock('dirt');           // convenience wrappers
 *   Sound.placeBlock('wood');
 *   Sound.step('grass');
 *   Sound.click(); Sound.pickup(); Sound.hurt(); Sound.jump(); Sound.splash();
 *   Sound.setVolume(0.7); Sound.setMuted(true); Sound.toggleMute();
 *
 * Every call is safe before init() (it silently does nothing) and never throws.
 */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var volume = 0.8;
  var muted = false;
  var lastPlay = {}; // name -> time, for cheap throttling of repeated sounds

  // ---------------------------------------------------------------------------
  // Material profiles: how each block material sounds.
  //   type: 'noise' (crunchy) | 'tone' (pitched) | 'both'
  //   freq: base filter frequency, q: filter resonance, decay: seconds,
  //   pitch: base tone frequency, gain: relative loudness
  // ---------------------------------------------------------------------------
  var MATERIALS = {
    grass:  { type: 'noise', freq: 900,  q: 0.7, decay: 0.16, gain: 0.55 },
    dirt:   { type: 'noise', freq: 650,  q: 0.8, decay: 0.18, gain: 0.6 },
    sand:   { type: 'noise', freq: 2600, q: 0.5, decay: 0.22, gain: 0.45 },
    gravel: { type: 'noise', freq: 1400, q: 1.2, decay: 0.2,  gain: 0.55 },
    stone:  { type: 'both',  freq: 1800, q: 1.6, decay: 0.14, pitch: 180, gain: 0.6 },
    wood:   { type: 'both',  freq: 1100, q: 2.2, decay: 0.16, pitch: 140, gain: 0.6 },
    leaves: { type: 'noise', freq: 3200, q: 0.6, decay: 0.14, gain: 0.35 },
    glass:  { type: 'tone',  freq: 4000, q: 6,   decay: 0.25, pitch: 1800, gain: 0.4 },
    water:  { type: 'noise', freq: 700,  q: 0.4, decay: 0.3,  gain: 0.4 },
    metal:  { type: 'tone',  freq: 3000, q: 8,   decay: 0.3,  pitch: 900, gain: 0.4 },
    wool:   { type: 'noise', freq: 500,  q: 0.5, decay: 0.12, gain: 0.4 },
    default:{ type: 'noise', freq: 1200, q: 1.0, decay: 0.16, gain: 0.5 }
  };

  // Map common block names to a material profile.
  var ALIASES = {
    grass_block: 'grass', grassblock: 'grass', grass_side: 'grass', grass_top: 'grass',
    log: 'wood', planks: 'wood', oak_log: 'wood', oak_planks: 'wood', birch_log: 'wood',
    crafting_table: 'wood', chest: 'wood', door: 'wood', ladder: 'wood',
    cobblestone: 'stone', cobble: 'stone', bedrock: 'stone', ore: 'stone',
    coal_ore: 'stone', iron_ore: 'stone', gold_ore: 'stone', diamond_ore: 'stone',
    brick: 'stone', bricks: 'stone', concrete: 'stone',
    oak_leaves: 'leaves', leaf: 'leaves',
    glass_block: 'glass', ice: 'glass',
    iron: 'metal', gold: 'metal', diamond: 'metal',
    snow: 'wool', cloth: 'wool'
  };

  function resolveMaterial(name) {
    if (!name) return MATERIALS.default;
    var key = String(name).toLowerCase().replace(/[\s-]+/g, '_');
    if (MATERIALS[key]) return MATERIALS[key];
    if (ALIASES[key] && MATERIALS[ALIASES[key]]) return MATERIALS[ALIASES[key]];
    // loose contains-match: "stone_bricks" -> stone, "oak_log" -> wood
    for (var a in ALIASES) {
      if (key.indexOf(a) !== -1 && MATERIALS[ALIASES[a]]) return MATERIALS[ALIASES[a]];
    }
    return MATERIALS.default;
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------
  function makeNoiseBuffer(ac) {
    var len = Math.floor(ac.sampleRate * 1.0);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      noiseBuffer = makeNoiseBuffer(ctx);
    } catch (e) {
      ctx = null;
      return null;
    }
    return ctx;
  }

  function ensure() {
    if (!ctx) init();
    if (!ctx) return false;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    return true;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  // ---------------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------------
  function noiseBurst(t0, dur, freq, q, gain, type) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    var filt = ctx.createBiquadFilter();
    filt.type = type || 'bandpass';
    filt.frequency.setValueAtTime(freq, t0);
    filt.Q.value = q;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function tone(t0, dur, freq, gain, wave, endFreq) {
    var osc = ctx.createOscillator();
    osc.type = wave || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function jitter(v) { return 1 + (Math.random() * 2 - 1) * v; }

  // ---------------------------------------------------------------------------
  // Sound recipes
  // ---------------------------------------------------------------------------
  var RECIPES = {
    // Breaking a block: a short crunchy burst, a bit longer than a step.
    break: function (t, o) {
      var m = resolveMaterial(o.material);
      var p = jitter(0.12);
      if (m.type !== 'tone') noiseBurst(t, m.decay * 1.4, m.freq * p, m.q, m.gain * 0.9);
      if (m.type !== 'noise') tone(t, m.decay * 1.2, (m.pitch || 200) * p, m.gain * 0.35, 'triangle', (m.pitch || 200) * 0.6);
      // little debris tail
      noiseBurst(t + 0.03, m.decay * 0.6, m.freq * 1.6 * p, m.q, m.gain * 0.35);
    },
    // Placing a block: a short, dull thud.
    place: function (t, o) {
      var m = resolveMaterial(o.material);
      var p = jitter(0.1);
      noiseBurst(t, m.decay * 0.7, m.freq * 0.8 * p, m.q, m.gain * 0.6);
      tone(t, 0.09, (m.pitch || 160) * p, m.gain * 0.25, 'sine', (m.pitch || 160) * 0.7);
    },
    // Footstep: quieter, shorter version of the material.
    step: function (t, o) {
      var m = resolveMaterial(o.material);
      var p = jitter(0.18);
      noiseBurst(t, m.decay * 0.55, m.freq * 0.9 * p, m.q, m.gain * 0.28);
    },
    // Mining tick while holding the mouse (crack progress).
    hit: function (t, o) {
      var m = resolveMaterial(o.material);
      noiseBurst(t, 0.06, m.freq * jitter(0.2), m.q, m.gain * 0.25);
    },
    // UI click (button press).
    click: function (t) {
      tone(t, 0.06, 880, 0.18, 'square', 660);
    },
    // Hotbar slot change: soft tick.
    select: function (t) {
      tone(t, 0.05, 1200, 0.12, 'square', 900);
    },
    // Item pickup: quick rising blip.
    pickup: function (t) {
      tone(t, 0.08, 660, 0.16, 'square', 1320);
      tone(t + 0.06, 0.08, 990, 0.12, 'square', 1500);
    },
    // Player hurt: low descending buzz.
    hurt: function (t) {
      tone(t, 0.22, 320, 0.3, 'sawtooth', 120);
      noiseBurst(t, 0.12, 500, 0.8, 0.2);
    },
    // Jump / land.
    jump: function (t) {
      tone(t, 0.1, 300, 0.12, 'sine', 520);
    },
    land: function (t) {
      noiseBurst(t, 0.12, 400, 0.7, 0.35);
      tone(t, 0.1, 140, 0.2, 'sine', 80);
    },
    // Water splash.
    splash: function (t) {
      noiseBurst(t, 0.35, 900, 0.5, 0.4, 'lowpass');
      noiseBurst(t + 0.05, 0.25, 1800, 0.6, 0.2);
    },
    // Door / chest open.
    open: function (t) {
      tone(t, 0.18, 220, 0.18, 'triangle', 330);
      noiseBurst(t, 0.15, 800, 1.5, 0.15);
    },
    // Level up / achievement chime.
    levelup: function (t) {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) tone(t + i * 0.09, 0.25, notes[i], 0.14, 'triangle');
    },
    // Zombie-ish groan (for mobs, if used).
    groan: function (t) {
      tone(t, 0.5, 110, 0.22, 'sawtooth', 70);
      noiseBurst(t, 0.4, 300, 2, 0.12);
    }
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  function play(name, opts) {
    if (muted) return;
    if (!ensure()) return;
    var recipe = RECIPES[name];
    if (!recipe) return;
    opts = opts || {};
    var t = now() + (opts.delay || 0);
    // Throttle: the same sound at most every 25 ms (avoids clipping on spam).
    var key = name + ':' + (opts.material || '');
    if (lastPlay[key] && t - lastPlay[key] < 0.025) return;
    lastPlay[key] = t;
    try { recipe(t, opts); } catch (e) { /* never break the game on audio errors */ }
  }

  var Sound = {
    init: init,
    play: play,
    breakBlock: function (material) { play('break', { material: material }); },
    placeBlock: function (material) { play('place', { material: material }); },
    step: function (material) { play('step', { material: material }); },
    hit: function (material) { play('hit', { material: material }); },
    click: function () { play('click'); },
    select: function () { play('select'); },
    pickup: function () { play('pickup'); },
    hurt: function () { play('hurt'); },
    jump: function () { play('jump'); },
    land: function () { play('land'); },
    splash: function () { play('splash'); },
    open: function () { play('open'); },
    levelup: function () { play('levelup'); },
    groan: function () { play('groan'); },

    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
    },
    getVolume: function () { return volume; },
    setMuted: function (m) {
      muted = !!m;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
    },
    isMuted: function () { return muted; },
    toggleMute: function () { Sound.setMuted(!muted); return muted; },
    isReady: function () { return !!ctx && ctx.state === 'running'; },
    materials: Object.keys(MATERIALS)
  };

  global.Sound = Sound;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
})(typeof window !== 'undefined' ? window : this);
