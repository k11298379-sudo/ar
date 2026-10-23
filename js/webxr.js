/**
 * Волшебник Изумрудного Города — Модуль WebXR Immersive-AR (Google ARCore)
 * Аппаратное сканирование реального пола через Google ARCore Hit-Test.
 * Ураган автоматически встаёт на первую найденную горизонтальную поверхность.
 * Единственное взаимодействие — свайпы (как в режиме афиши).
 */
(function(window) {
  'use strict';

  let xrSession       = null;
  let xrRefSpace      = null;
  let xrHitTestSource = null;
  let isWebXrActive   = false;

  // Флаг: ураган уже поставлен на реальный пол (не двигать повторно)
  let tornadoPlacedOnFloor = false;
  // Целевая позиция на полу (для плавного парения)
  let tornadoFloorPos = null;

  window.isWebXrActive = false;

  // ─── 1. ПРОВЕРКА ПОДДЕРЖКИ ───────────────────────────────
  async function checkWebXrSupport() {
    if (!navigator.xr || typeof navigator.xr.isSessionSupported !== 'function') return false;
    try {
      return !!(await navigator.xr.isSessionSupported('immersive-ar'));
    } catch (e) {
      console.warn('[WebXR] Проверка поддержки:', e);
      return false;
    }
  }

  // ─── 2. ИНИЦИАЛИЗАЦИЯ ────────────────────────────────────
  async function initWebXrEngine() {
    const isSupported = await checkWebXrSupport();
    if (!isSupported) {
      console.log('ℹ️ [WebXR] Immersive-AR не поддерживается. Активен режим Universal Web-AR (MindAR).');
      return;
    }
    console.log('🌟 [WebXR] Google ARCore Immersive-AR поддерживается!');
    createWebXrPillButton();
  }

  // ─── 3. КНОПКА ARCore ────────────────────────────────────
  function createWebXrPillButton() {
    if (document.getElementById('btn-webxr-toggle')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-webxr-toggle';
    btn.innerHTML = '🌟 <span>Сканировать пол (Google ARCore)</span>';
    btn.style.cssText = `
      position: fixed;
      bottom: 76px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: linear-gradient(135deg, rgba(0,255,162,0.95), rgba(0,168,107,0.95));
      border: 1.5px solid #00ffa2;
      color: #012415;
      font-weight: 700;
      font-size: 13.5px;
      padding: 11px 22px;
      border-radius: 30px;
      box-shadow: 0 4px 25px rgba(0,255,162,0.55), inset 0 1px 0 rgba(255,255,255,0.4);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      backdrop-filter: blur(8px);
      white-space: nowrap;
      transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
      font-family: inherit;
    `;

    btn.addEventListener('touchstart', () => { btn.style.transform = 'translateX(-50%) scale(0.96)'; }, { passive: true });
    btn.addEventListener('touchend',   () => { btn.style.transform = 'translateX(-50%) scale(1.0)'; },  { passive: true });

    btn.addEventListener('click', async () => {
      if (isWebXrActive) stopWebXrSession();
      else await startWebXrSession();
    });

    document.body.appendChild(btn);
  }

  // ─── 4. ЗАПУСК СЕССИИ ────────────────────────────────────
  async function startWebXrSession() {
    const tRenderer = window.tRenderer;
    const tScene    = window.tScene;
    if (!tRenderer || !tScene) return;

    try {
      console.log('[WebXR] Запрос сессии immersive-ar с hit-test...');

      // Приостанавливаем HTML5-камеру, чтобы ARCore мог захватить поток
      const camVideo = document.getElementById('camera-video');
      if (camVideo && camVideo.srcObject) {
        camVideo.srcObject.getTracks().forEach(t => { t.enabled = false; });
        camVideo.style.opacity = '0';
      }

      // Останавливаем стандартный цикл рендеринга
      if (window.stopThreeScene1) window.stopThreeScene1();

      const stageRoot = document.getElementById('ar-stage') || document.body;
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'light-estimation'],
        domOverlay: { root: stageRoot }
      });

      xrSession = session;
      isWebXrActive        = true;
      window.isWebXrActive = true;
      tornadoPlacedOnFloor = false;
      tornadoFloorPos      = null;
      window.tornadoFloorPos = null;

      tRenderer.xr.enabled = true;
      await tRenderer.xr.setSession(session);

      // Пространства отсчёта
      xrRefSpace = await session.requestReferenceSpace('local-floor');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      xrHitTestSource = await session.requestHitTestSource({ space: viewerSpace });

      // Переводим ураган в глобальную сцену (если был внутри диорамы)
      // Сначала прячем — покажем только когда ARCore найдёт реальный пол
      const tornadoGroup = window.tornadoGroup;
      if (tornadoGroup) {
        if (tornadoGroup.parent !== tScene) {
          tScene.attach(tornadoGroup);
        }
        tornadoGroup.scale.setScalar(window.TORNADO_BASE_SCALE || 0.70);
        tornadoGroup.visible = false; // скрыт до обнаружения пола
      }

      // Состояния для работы свайпов (как в режиме афиши)
      window.tornadoState = 'ROAMING';
      window.houseState   = 'ORBITING';

      session.addEventListener('end', onWebXrSessionEnded);

      // Кнопка — режим «Выйти»
      const btn = document.getElementById('btn-webxr-toggle');
      if (btn) {
        btn.innerHTML = '❌ <span>Выйти из ARCore</span>';
        btn.style.background    = 'rgba(15,23,42,0.9)';
        btn.style.color         = '#f1f5f9';
        btn.style.borderColor   = '#475569';
      }

      // Подсказка для сканирования пола
      const hintText = document.getElementById('swipe-hint-text');
      const swipeHint = document.getElementById('swipe-hint');
      if (swipeHint) swipeHint.style.display = 'flex';
      if (hintText) hintText.textContent = '📱 Направьте камеру на пол для сканирования...';

      setTimeout(() => {
        if (isWebXrActive && !tornadoPlacedOnFloor && tornadoGroup) {
          tornadoFloorPos = new THREE.Vector3(0, -0.75, -1.35);
          window.tornadoFloorPos = tornadoFloorPos;
          tornadoPlacedOnFloor = true;
          tornadoGroup.position.copy(tornadoFloorPos);
          tornadoGroup.visible = true;
          if (hintText) hintText.textContent = '🌪️ Ураган на полу! Свайпайте экран для перемещения!';
          if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();
        }
      }, 3500);

      const prompt = document.getElementById('ar-target-prompt');
      if (prompt) prompt.style.display = 'none';

      if (window.sfx && window.sfx.chime) window.sfx.chime();

      // Запускаем кадровый цикл WebXR
      tRenderer.setAnimationLoop(onWebXrFrame);

    } catch (err) {
      console.warn('[WebXR] Ошибка запуска сессии:', err);
      alert('Не удалось запустить режим Google ARCore: ' + (err.message || 'Проверьте поддержку WebXR в браузере'));
      onWebXrSessionEnded();
    }
  }

  // ─── 5. ЗАВЕРШЕНИЕ СЕССИИ ────────────────────────────────
  function stopWebXrSession() {
    if (xrSession) xrSession.end();
  }

  function onWebXrSessionEnded() {
    console.log('[WebXR] Сессия ARCore завершена, возврат в Universal Web-AR режим.');
    isWebXrActive        = false;
    window.isWebXrActive = false;
    xrSession            = null;
    xrHitTestSource      = null;
    tornadoPlacedOnFloor = false;
    tornadoFloorPos      = null;
      window.tornadoFloorPos = null;

    const tRenderer = window.tRenderer;
    if (tRenderer) {
      tRenderer.setAnimationLoop(null);
      tRenderer.xr.enabled = false;
    }

    // Возобновляем HTML5-камеру
    const camVideo = document.getElementById('camera-video');
    if (camVideo && camVideo.srcObject) {
      camVideo.srcObject.getTracks().forEach(t => { t.enabled = true; });
      camVideo.style.opacity = '1';
    }

    // Кнопка — режим «Включить ARCore»
    const btn = document.getElementById('btn-webxr-toggle');
    if (btn) {
      btn.innerHTML       = '🌟 <span>Сканировать пол (Google ARCore)</span>';
      btn.style.background  = 'linear-gradient(135deg, rgba(0,255,162,0.95), rgba(0,168,107,0.95))';
      btn.style.color       = '#012415';
      btn.style.borderColor = '#00ffa2';
    }

    // Возвращаем ураган в диораму
    const tornadoGroup  = window.tornadoGroup;
    const dioramaGroup  = window.dioramaGroup;
    if (tornadoGroup && dioramaGroup && tornadoGroup.parent !== dioramaGroup) {
      dioramaGroup.add(tornadoGroup);
      tornadoGroup.position.copy(window.TORNADO_ROOM_DEFAULT || new THREE.Vector3(0, -0.62, 0.16));
    }

    // Возобновляем стандартный цикл Three.js
    if (window.S && window.S.scene === 1 && window.threeRenderLoop) {
      requestAnimationFrame(window.threeRenderLoop);
    }
  }

  // ─── 6. КАДРОВЫЙ ЦИКЛ WEBXR ─────────────────────────────
  function onWebXrFrame(time, frame) {
    if (!frame || !isWebXrActive) return;

    const tRenderer    = window.tRenderer;
    const tScene       = window.tScene;
    const tCamera      = window.tCamera;
    const tClock       = window.tClock;
    const tornadoGroup = window.tornadoGroup;

    const dt      = Math.min(tClock ? tClock.getDelta() : 0.016, 0.05);
    const elapsed = tClock ? tClock.getElapsedTime() : (time * 0.001);

    // ── Hit-Test: поиск горизонтальной поверхности (пол) ──
    if (xrHitTestSource && xrRefSpace && !tornadoPlacedOnFloor) {
      const hitResults = frame.getHitTestResults(xrHitTestSource);

      if (hitResults.length > 0) {
        const pose = hitResults[0].getPose(xrRefSpace);
        if (pose) {
          const m  = pose.transform.matrix;
          // Y-компонента нормали поверхности: > 0.65 → горизонтальный пол
          const ny = m[5];

          if (ny > 0.65) {
            // ✅ Пол найден — автоматически ставим ураган (один раз)
            const mat = new THREE.Matrix4().fromArray(m);
            const pos = new THREE.Vector3().setFromMatrixPosition(mat);
            tornadoFloorPos      = pos;
            window.tornadoFloorPos = tornadoFloorPos;
            tornadoPlacedOnFloor = true;

            if (tornadoGroup) {
              tornadoGroup.position.copy(pos);
              tornadoGroup.visible = true; // теперь показываем ураган
            }

            if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();
            const banner = document.getElementById('swipe-hint-text');
            if (banner) banner.textContent = '🌪️ Пол найден! Свайпайте экран для перемещения!';
            console.log('[WebXR] Ураган автоматически установлен на реальный пол:', pos);
          }
        }
      }
    }

    // ── Плавное парение урагана над обнаруженным полом ────
    if (tornadoGroup && tornadoFloorPos) {
      tornadoGroup.position.x = tornadoFloorPos.x;
      tornadoGroup.position.z = tornadoFloorPos.z;
      // Небольшое покачивание по Y
      tornadoGroup.position.y = tornadoFloorPos.y + Math.sin(elapsed * 3.2) * 0.018;
    }

    // ── Общий цикл спецэффектов (вихрь, кольца, пыль, домик) ─
    if (window.updateScene1VFX) {
      window.updateScene1VFX(dt, elapsed, time);
    }

    // ── Рендеринг (камера управляется ARCore в 6DOF) ──────
    if (tRenderer && tScene && tCamera) {
      tRenderer.render(tScene, tCamera);
    }
  }

  // ─── 7. ЭКСПОРТ ──────────────────────────────────────────
  window.checkWebXrSupport = checkWebXrSupport;
  window.initWebXrEngine   = initWebXrEngine;
  window.startWebXrSession = startWebXrSession;
  window.stopWebXrSession  = stopWebXrSession;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWebXrEngine);
  } else {
    initWebXrEngine();
  }

})(window);
