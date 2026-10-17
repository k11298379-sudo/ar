/**
 * Волшебник Изумрудного Города — Сцена 2 и 3: Панорама, Дорога из жёлтого кирпича и Изумрудный Город
 */
(function(window) {
  'use strict';

  // ─── ВИРТУАЛЬНАЯ КАМЕРА ПАНОРАМЫ (YAW) ──────────────────
  function setYaw(y) {
    window.S.camYaw = y;
    const cam = document.getElementById('cam');
    if (cam) {
      cam.style.transform = `rotateY(${-y}deg)`;
    }
  }

  function rotateTo(target, durationMs, onDone) {
    const start = window.S.camYaw;
    let diff = target - start;
    if (diff >  180) diff -= 360;
    if (diff < -180) diff += 360;
    const t0 = performance.now();

    function step(t) {
      const p = Math.min((t - t0) / durationMs, 1);
      const e = 0.5 - Math.cos(p * Math.PI) * 0.5; // ease in-out
      setYaw((start + diff * e + 360) % 360);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        setYaw((target + 360) % 360);
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(step);
  }

  // ═══════════════════════════════════════════════════════
  //  СЦЕНА 2 — ИЗУМРУДНЫЙ ГОРОД → ПОВОРОТ → ШЕСТВИЕ ГЕРОЕВ
  // ═══════════════════════════════════════════════════════
  function startScene2() {
    window.S.scene = 2;
    const badge   = document.getElementById('stage-badge');
    const world   = document.getElementById('world');
    const cityImg = document.getElementById('city-img');

    if (badge) badge.textContent = '🏰 Сцена 2 — Изумрудный Город';
    if (world) world.style.display = 'block';
    setYaw(0); // взгляд на город

    if (window.sfx && window.sfx.chime) window.sfx.chime();

    // Анимация подъема Изумрудного Города
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (cityImg) cityImg.classList.add('visible');
      }, 50);
    });

    // Через 2.5 с — автоматический кинематографичный разворот на 180° к Дороге
    setTimeout(() => {
      if (badge) badge.textContent = '🛤 Сцена 2 — Оглядываемся назад…';
      rotateTo(180, 1800, () => {
        if (badge) badge.textContent = '🛤 Сцена 2 — Герои идут по дороге';
        startHeroWalk();
      });
    }, 2500);
  }

  // ─── ШЕСТВИЕ ГЕРОЕВ ПО ДОРОГЕ ИЗ ЖЁЛТОГО КИРПИЧА ────────
  const WALK_DURATION_MS = 9500;  // 9.5 секунд реалистичного движения
  const SCALE_START = 0.065;      // крошечные фигурки на горизонте
  const SCALE_END   = 1.0;        // натуральный размер вблизи
  const SCENE3_TRIGGER = 0.88;    // приближение для триггера ворот

  let heroWalkRAF = null;
  let walkStartTime = null;
  let scene3Triggered = false;
  let lastStepSoundTime = 0;
  let horizonY = 280;

  function startHeroWalk() {
    window.S.heroWalkActive = true;
    scene3Triggered = false;

    const roadImg = document.getElementById('road-img');
    const heroes  = document.getElementById('heroes');
    const bubble  = document.getElementById('bubble');

    const roadRect = roadImg ? roadImg.getBoundingClientRect() : null;
    const roadHeight = (roadRect && roadRect.height > 100) ? roadRect.height : (window.innerHeight * 0.48);
    // В road.svg горизонт расположен на ~81% высоты от низа
    horizonY = Math.round(roadHeight * 0.81);

    if (heroes) {
      heroes.querySelectorAll('.hero').forEach(h => h.classList.add('walking'));
      heroes.style.opacity = '0.75';
      heroes.style.transform = `translateX(-50%) translateY(${-horizonY}px) scale(${SCALE_START})`;
    }

    if (bubble) {
      bubble.style.opacity = '0';
      bubble.textContent = 'Идём в Изумрудный Город! ✨';
    }

    walkStartTime = performance.now();
    lastStepSoundTime = walkStartTime;
    heroWalkRAF = requestAnimationFrame(heroWalkStep);
  }

  function heroWalkStep(t) {
    if (!window.S.heroWalkActive) return;
    const heroes = document.getElementById('heroes');
    const bubble = document.getElementById('bubble');

    const elapsed = t - walkStartTime;
    const rawP = Math.min(elapsed / WALK_DURATION_MS, 1.0);

    // Перспективная кривая движения по прямой дороге к камере
    const u = rawP / (rawP + (1.0 - rawP) * 3.0);

    // Вертикальное смещение от горизонта к зрителю
    const currentY = -horizonY * (1.0 - u) - 14.0 * u;
    const currentScale = SCALE_START + (SCALE_END - SCALE_START) * u;
    const swayX = Math.sin(rawP * 24.0) * (4.0 * u + 1.2);

    if (heroes) {
      heroes.style.transform = `translateX(calc(-50% + ${swayX.toFixed(1)}px)) translateY(${currentY.toFixed(1)}px) scale(${currentScale.toFixed(4)})`;
      const depthOpacity = Math.min(0.75 + u * 0.35, 1.0);
      heroes.style.opacity = depthOpacity.toFixed(2);
    }

    if (bubble && u >= 0.45 && bubble.style.opacity !== '1' && !scene3Triggered) {
      bubble.style.opacity = '1';
    }

    // Звуки шагов по жёлтому кирпичу
    if (t - lastStepSoundTime > 340) {
      lastStepSoundTime = t;
      const stepVol = 0.03 + 0.14 * u;
      if (window.sfx && window.sfx.step) window.sfx.step(stepVol);
    }

    if (!scene3Triggered && u >= SCENE3_TRIGGER) {
      scene3Triggered = true;
      onHeroesArrived(currentY, currentScale);
      return;
    }

    if (rawP < 1.0) {
      heroWalkRAF = requestAnimationFrame(heroWalkStep);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  СЦЕНА 3 — ПОВОРОТ К ГОРОДУ И ВХОД В ВОРОТА
  // ═══════════════════════════════════════════════════════
  function onHeroesArrived(finalY, finalScale) {
    window.S.heroWalkActive = false;
    window.S.scene = 3;
    if (window.sfx && window.sfx.chime) window.sfx.chime();

    const heroes = document.getElementById('heroes');
    const bubble = document.getElementById('bubble');
    const badge  = document.getElementById('stage-badge');

    if (heroes) {
      heroes.querySelectorAll('.hero').forEach(h => h.classList.remove('walking'));
      const y = (finalY !== undefined) ? finalY : -14;
      const sc = (finalScale !== undefined) ? finalScale : 1.0;
      heroes.style.transform = `translateX(-50%) translateY(${y.toFixed(1)}px) scale(${sc.toFixed(4)})`;
    }

    if (bubble) bubble.textContent = 'Вот он — Изумрудный Город! 🏰✨';
    if (badge)  badge.textContent  = '🏰 Сцена 3 — Поворачиваемся к Городу…';

    setTimeout(() => {
      if (bubble) bubble.style.opacity = '0';
      rotateTo(0, 2000, () => {
        if (badge) badge.textContent = '✨ Сцена 3 — Герои входят в Город!';
        if (window.doFlash) window.doFlash('#00ffa2', 350);
        if (window.sfx && window.sfx.tada) window.sfx.tada();
        setTimeout(heroesEnterCity, 500);
      });
    }, 1200);
  }

  function heroesEnterCity() {
    const s3 = document.getElementById('scene3-heroes');
    const badge = document.getElementById('stage-badge');
    if (!s3) return;

    s3.style.display = 'flex';
    s3.querySelectorAll('.hero-s3').forEach(h => h.classList.add('walking'));

    setTimeout(() => {
      s3.classList.add('walk-in');

      setTimeout(() => {
        if (window.doFlash) window.doFlash('#c8ffec', 500);
        if (window.sfx && window.sfx.chime) window.sfx.chime();
        if (badge) {
          badge.textContent = '🎉 Добро пожаловать в Изумрудный Город!';
          badge.style.boxShadow = '0 0 24px rgba(0,255,162,0.75)';
          badge.style.transition = 'box-shadow 1s ease';
        }
        s3.querySelectorAll('.hero-s3').forEach(h => h.classList.remove('walking'));
      }, 4200);

    }, 300);
  }

  // Экспорт
  window.setYaw           = setYaw;
  window.rotateTo         = rotateTo;
  window.startScene2      = startScene2;
  window.startHeroWalk    = startHeroWalk;
  window.onHeroesArrived  = onHeroesArrived;
  window.heroesEnterCity  = heroesEnterCity;

})(window);
