/**
 * Волшебник Изумрудного Города — Модуль WebXR Immersive-AR (Google ARCore)
 * Аппаратное сканирование пространства через Google ARCore Hit-Test.
 * Непрерывное распознавание любых поверхностей: пол, стол, стул, кровать, полка, ступени.
 * Ураган автоматически адаптирует высоту под обнаруженную физическую поверхность.
 * Единственное управление — свайпы (как в режиме афиши).
 */
(function(window) {
  'use strict';

  let xrSession       = null;
  let xrRefSpace      = null;
  let xrHitTestSource = null;
  let isWebXrActive   = false;

  // Флаг первичной фиксации на поверхности
  let tornadoPlacedOnFloor = false;
  // Целевая позиция (x, y, z)
  let tornadoFloorPos = null;
  // Динамическая высота текущей поверхности (стол, мебель, ступени, пол)
  let targetSurfaceY  = null;
  // Базовый уровень пола комнаты (для расчёта относительной высоты мебели)
  let baseFloorY      = null;
  // Флаг показа запроса на старте (чтобы не дублировать)
  let hasShownLaunchPrompt = false;

  window.isWebXrActive   = false;
  window.tornadoFloorPos = null;

  // ─── 1. ПРОВЕРКА ПОДДЕРЖКИ WEBXR / ARCORE ────────────────
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
      console.log('ℹ️ [WebXR] Google ARCore Immersive-AR не поддерживается. Активен Universal Web-AR (MindAR).');
      return;
    }
    console.log('🌟 [WebXR] Google ARCore Immersive-AR поддерживается!');
    createWebXrPillButton();

    // Официальный запрос сразу при запуске приложения (через 600 мс)
    setTimeout(() => {
      if (!isWebXrActive && !hasShownLaunchPrompt) {
        hasShownLaunchPrompt = true;
        showOfficialArCorePrompt('launch');
      }
    }, 600);
  }

  // ─── 3. ОФИЦИАЛЬНЫЙ МОДАЛЬНЫЙ ДИАЛОГ GOOGLE ARCORE ────────
  function showOfficialArCorePrompt(triggerReason = 'launch') {
    if (document.getElementById('arcore-official-modal')) return;
    if (isWebXrActive) return;

    const modal = document.createElement('div');
    modal.id = 'arcore-official-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(2, 10, 7, 0.88);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const isAfterPoster = triggerReason === 'poster';
    const mainDesc = isAfterPoster
      ? 'Ураган вырвался из афиши! Разрешите калибровку Google ARCore для реалистичного размещения объектов на поверхностях комнаты (пол, стол, кровать, мебель, ступени) и свободного 6DoF-перемещения.'
      : 'Для точного размещения 3D-объектов в вашей комнате, распознавания любых поверхностей (пол, столы, мебель, ступени) и свободного перемещения свайпами требуется служба Google Play Services for AR (ARCore).';

    modal.innerHTML = `
      <div style="
        background: linear-gradient(165deg, rgba(8, 28, 20, 0.98), rgba(2, 12, 8, 0.98));
        border: 1.5px solid #00ffa2;
        box-shadow: 0 10px 40px rgba(0, 255, 162, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15);
        border-radius: 24px;
        padding: 24px 20px;
        max-width: 380px;
        width: 100%;
        text-align: center;
        color: #ffffff;
      ">
        <div style="display:inline-flex; align-items:center; gap:6px; background:rgba(0,255,162,0.12); border:1px solid rgba(0,255,162,0.4); padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; color:#00ffa2; letter-spacing:0.5px; margin-bottom:14px; text-transform:uppercase;">
          <span>🌐</span> Google Play Services for AR
        </div>

        <h3 style="margin:0 0 8px 0; font-size:18px; font-weight:800; color:#ffffff; line-height:1.3;">
          Служба Google ARCore
        </h3>

        <div style="font-size:12px; color:#8ce5be; margin-bottom:12px; font-weight:600;">
          Запрос разрешения пространственного позиционирования
        </div>

        <p style="margin:0 0 16px 0; font-size:13px; line-height:1.5; color:#c5e3d7;">
          ${mainDesc}
        </p>

        <div style="background:rgba(0,0,0,0.35); border:1px solid rgba(0,255,162,0.2); border-radius:14px; padding:10px 14px; text-align:left; font-size:11.5px; color:#a7d9c5; line-height:1.45; margin-bottom:20px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <span>📐</span> <b>Детекция поверхностей:</b> пол, столы, мебель, ступени
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <span>🎮</span> <b>Управление:</b> свободные свайпы в пространстве 6DoF
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span>🔒</span> <b>Безопасность:</b> данные камеры обрабатываются на чипе и не сохраняются
          </div>
        </div>

        <button id="btn-arcore-allow" style="
          width: 100%;
          background: linear-gradient(135deg, #00ffa2, #00c87a);
          border: none;
          color: #012415;
          font-weight: 800;
          font-size: 14.5px;
          padding: 13px 20px;
          border-radius: 16px;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(0, 255, 162, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 10px;
          font-family: inherit;
        ">
          <span>🏛️</span> <span>Разрешить Google ARCore</span>
        </button>

        <button id="btn-arcore-dismiss" style="
          background: transparent;
          border: none;
          color: #7fa695;
          font-size: 12px;
          cursor: pointer;
          padding: 6px;
          font-family: inherit;
        ">
          Продолжить в стандартном режиме
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-arcore-allow').addEventListener('click', async () => {
      modal.remove();
      await startWebXrSession();
    });

    document.getElementById('btn-arcore-dismiss').addEventListener('click', () => {
      modal.remove();
    });
  }

  // ─── 4. НИЖНЯЯ КНОПКА-ПИЛЮЛЯ ARCORE ───────────────────────
  function createWebXrPillButton() {
    if (document.getElementById('btn-webxr-toggle')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-webxr-toggle';
    btn.innerHTML = '🌐 <span>Служба ARCore: Пространственный трекинг</span>';
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
      padding: 10px 20px;
      border-radius: 30px;
      box-shadow: 0 4px 25px rgba(0,255,162,0.55), inset 0 1px 0 rgba(255,255,255,0.4);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
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

  // ─── 5. ЗАПУСК СЕССИИ ARCORE ──────────────────────────────
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

      xrSession            = session;
      isWebXrActive        = true;
      window.isWebXrActive = true;
      tornadoPlacedOnFloor = false;
      tornadoFloorPos      = null;
      targetSurfaceY       = null;
      baseFloorY           = null;
      window.tornadoFloorPos = null;

      tRenderer.xr.enabled = true;
      await tRenderer.xr.setSession(session);

      // Пространства отсчёта
      xrRefSpace = await session.requestReferenceSpace('local-floor');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      xrHitTestSource = await session.requestHitTestSource({ space: viewerSpace });

      // Переводим ураган в глобальную сцену
      const tornadoGroup = window.tornadoGroup;
      if (tornadoGroup) {
        if (tornadoGroup.parent !== tScene) {
          tScene.attach(tornadoGroup);
        }
        tornadoGroup.scale.setScalar(window.TORNADO_BASE_SCALE || 0.70);
        tornadoGroup.visible = false; // скрыт до первого обнаружения поверхности
      }

      // Состояния для работы свайпов
      window.tornadoState = 'ROAMING';
      window.houseState   = 'ORBITING';

      session.addEventListener('end', onWebXrSessionEnded);

      // Кнопка — режим «Отключить»
      const btn = document.getElementById('btn-webxr-toggle');
      if (btn) {
        btn.innerHTML = '❌ <span>Отключить Google ARCore</span>';
        btn.style.background    = 'rgba(15,23,42,0.92)';
        btn.style.color         = '#f1f5f9';
        btn.style.borderColor   = '#475569';
      }

      // Подсказка для сканирования пространства
      const hintText  = document.getElementById('swipe-hint-text');
      const swipeHint = document.getElementById('swipe-hint');
      if (swipeHint) swipeHint.style.display = 'flex';
      if (hintText)  hintText.textContent = '📱 Направьте камеру на пол, стол или мебель...';

      // Мягкий фоллбэк: если поверхность не обнаружена за 3.5 секунды
      setTimeout(() => {
        if (isWebXrActive && !tornadoPlacedOnFloor && tornadoGroup) {
          tornadoFloorPos = new THREE.Vector3(0, -0.75, -1.35);
          targetSurfaceY  = -0.75;
          baseFloorY      = -0.75;
          window.tornadoFloorPos = tornadoFloorPos;
          tornadoPlacedOnFloor   = true;
          tornadoGroup.position.copy(tornadoFloorPos);
          tornadoGroup.visible = true;
          if (hintText) hintText.textContent = '🌪️ Ураган установлен! Свайпайте экран для перемещения!';
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

  // ─── 6. ЗАВЕРШЕНИЕ СЕССИИ ────────────────────────────────
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
    targetSurfaceY       = null;
    baseFloorY           = null;
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

    // Кнопка — режим активации
    const btn = document.getElementById('btn-webxr-toggle');
    if (btn) {
      btn.innerHTML       = '🌐 <span>Служба ARCore: Пространственный трекинг</span>';
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

  // ─── 7. КАДРОВЫЙ ЦИКЛ WEBXR С ДИНАМИЧЕСКИМ РАСПОЗНАВАНИЕМ ПОВЕРХНОСТЕЙ ─
  function onWebXrFrame(time, frame) {
    if (!frame || !isWebXrActive) return;

    const tRenderer    = window.tRenderer;
    const tScene       = window.tScene;
    const tCamera      = window.tCamera;
    const tClock       = window.tClock;
    const tornadoGroup = window.tornadoGroup;

    const dt      = Math.min(tClock ? tClock.getDelta() : 0.016, 0.05);
    const elapsed = tClock ? tClock.getElapsedTime() : (time * 0.001);

    // ── Hit-Test: поиск и непрерывное распознавание поверхностей ──
    // (пол, стол, стул, кровать, полка, лестницы и перепады высот)
    if (xrHitTestSource && xrRefSpace) {
      const hitResults = frame.getHitTestResults(xrHitTestSource);

      if (hitResults.length > 0) {
        const pose = hitResults[0].getPose(xrRefSpace);
        if (pose) {
          const m  = pose.transform.matrix;
          // Y-компонента нормали поверхности: > 0.65 → горизонтальная плоскость любой высоты
          const ny = m[5];

          if (ny > 0.65) {
            const mat = new THREE.Matrix4().fromArray(m);
            const hitPos = new THREE.Vector3().setFromMatrixPosition(mat);

            if (baseFloorY === null || hitPos.y < baseFloorY) {
              baseFloorY = hitPos.y;
            }

            if (!tornadoPlacedOnFloor) {
              // Первое размещение урагана на обнаруженной поверхности
              tornadoFloorPos      = hitPos.clone();
              targetSurfaceY       = hitPos.y;
              window.tornadoFloorPos = tornadoFloorPos;
              tornadoPlacedOnFloor = true;

              if (tornadoGroup) {
                tornadoGroup.position.copy(hitPos);
                tornadoGroup.visible = true;
              }

              if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();
              console.log('[WebXR] Поверхность найдена и привязана:', hitPos);
            } else {
              // Поверхность изменилась (стол, стул, кровать, полка, ступени):
              // Обновляем целевую высоту
              targetSurfaceY = hitPos.y;
            }

            // Динамический статус поверхности на экране
            const banner = document.getElementById('swipe-hint-text');
            if (banner) {
              const diffCm = Math.round((hitPos.y - (baseFloorY !== null ? baseFloorY : hitPos.y)) * 100);
              if (diffCm >= 20) {
                banner.textContent = `🛋️ Поверхность: мебель / стол (+${diffCm} см)`;
              } else {
                banner.textContent = '🌪️ Поверхность пола. Свайпайте для движения!';
              }
            }
          }
        }
      }
    }

    // ── Плавное парение урагана над обнаруженной поверхностью ────
    if (tornadoGroup && tornadoFloorPos) {
      if (targetSurfaceY !== null) {
        // Мягко адаптируем высоту под уровень поверхности (пол, стол, кровать, ступени)
        tornadoFloorPos.y = THREE.MathUtils.lerp(tornadoFloorPos.y, targetSurfaceY, dt * 4.5);
      }
      tornadoGroup.position.x = tornadoFloorPos.x;
      tornadoGroup.position.z = tornadoFloorPos.z;
      // Небольшое живое парение по Y
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

  // ─── 8. ЭКСПОРТ ──────────────────────────────────────────
  window.checkWebXrSupport        = checkWebXrSupport;
  window.initWebXrEngine          = initWebXrEngine;
  window.startWebXrSession        = startWebXrSession;
  window.stopWebXrSession         = stopWebXrSession;
  window.showOfficialArCorePrompt = showOfficialArCorePrompt;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWebXrEngine);
  } else {
    initWebXrEngine();
  }

})(window);
