/**
 * Волшебник Изумрудного Города — Web Audio SFX Engine
 * Синтез звуков бури, колокольчиков, шагов, фанфар и ударов на чистом Web Audio API
 */
(function(window) {
  'use strict';

  let audioCtx = null;

  function getCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  window.addEventListener('pointerdown', () => getCtx(), { once: true });
  window.addEventListener('touchstart', () => getCtx(), { once: true });

  const sfx = {
    wind(vol = 0.15) {
      const ctx = getCtx();
      if (!ctx || (window.ARState && !window.ARState.soundOn)) return;
      try {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 350 + vol * 500;
        f.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        src.connect(f);
        f.connect(g);
        g.connect(ctx.destination);
        src.start();
      } catch (e) {}
    },

    whoosh() {
      const ctx = getCtx();
      if (!ctx || (window.ARState && !window.ARState.soundOn)) return;
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(420, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.65);
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.7);
      } catch (e) {}
    },

    chime() {
      const ctx = getCtx();
      if (!ctx || (window.ARState && !window.ARState.soundOn)) return;
      try {
        [523.25, 659.25, 783.99, 1046.5].forEach((fr, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = fr;
          const t = ctx.currentTime + i * 0.13;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.18, t + 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t);
          o.stop(t + 0.95);
        });
      } catch (e) {}
    },

    snap() {
      const ctx = getCtx();
      if (!ctx || (window.ARState && !window.ARState.soundOn)) return;
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.22);
        g.gain.setValueAtTime(0.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.25);
      } catch (e) {}
    },

    tada() {
      const ctx = getCtx();
      if (!ctx || (window.ARState && !window.ARState.soundOn)) return;
      try {
        [659.25, 783.99, 987.77, 1318.5].forEach((fr, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = fr;
          const t = ctx.currentTime + i * 0.09;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.22, t + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t);
          o.stop(t + 1.2);
        });
      } catch (e) {}
    },

    step(vol = 0.08) {
      const ctx = getCtx();
      if (!ctx || (window.ARState && !window.ARState.soundOn)) return;
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(290 + Math.random() * 80, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(130, ctx.currentTime + 0.05);
        g.gain.setValueAtTime(vol * 0.22, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.06);
      } catch (e) {}
    }
  };

  window.getCtx = getCtx;
  window.sfx = sfx;
})(window);
