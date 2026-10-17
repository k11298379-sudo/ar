/**
 * Волшебник Изумрудного Города — Состояние приложения и вспомогательные функции DOM
 */
(function(window) {
  'use strict';

  // ─── СОСТОЯНИЕ ПРИЛОЖЕНИЯ ──────────────────────────────
  const S = {
    scene: 1,             // 1 = Ураган, 2 = Панорама дороги, 3 = Вход в Изумрудный Город
    soundOn: true,        // Включение/выключение звука
    camYaw: 0,            // Угол виртуальной камеры 0..360°
    heroScale: 0.06,      // Масштаб героев: 0.06 (горизонт) → 1.0 (вблизи)
    heroWalkActive: false // Флаг активности шагов
  };

  window.S = S;
  window.ARState = S;

  // ─── DOM ХЕЛПЕРЫ ─────────────────────────────────────
  const $ = id => document.getElementById(id);
  window.$ = $;

  // ─── ЭФФЕКТ ВСПЫШКИ (FLASH) ──────────────────────────
  function doFlash(color = '#00ffa2', hold = 250) {
    const flashEl = $('flash');
    if (!flashEl) return;
    flashEl.style.background = color;
    flashEl.style.opacity = '0.7';
    setTimeout(() => {
      flashEl.style.opacity = '0';
    }, hold);
  }
  window.doFlash = doFlash;

})(window);
