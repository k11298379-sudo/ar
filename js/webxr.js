/**
 * Волшебник Изумрудного Города — Модуль WebXR Immersive-AR (Google ARCore)
 * Активируется автоматически только на поддерживаемых устройствах (Google Chrome на Android, Samsung Internet).
 * Для остальных устройств (iPhone Safari, Mi Browser, Telegram) работает Universal Web-AR режим.
 */
(function(window) {
  'use strict';

  let xrSession = null;
  let xrRefSpace = null;
  let xrHitTestSource = null;
  let xrHitTestSourceRequested = false;
  let reticle = null;
  let isWebXrActive = false;

  window.isWebXrActive = false;

  // 1. Проверка поддержки WebXR Immersive-AR
  async function checkWebXrSupport() {
    if (!navigator.xr || typeof navigator.xr.isSessionSupported !== 'function') {
      return false;
    }
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      return !!supported;
    } catch (e) {
      console.warn('[WebXR] Check warning:', e);
      return false;
    }
  }

  // 2. Инициализация кнопки переключения в WebXR
  async function initWebXrEngine() {
    const isSupported = await checkWebXrSupport();
    if (!isSupported) {
      console.log('ℹ️ [WebXR] Не поддерживается в этом браузере. Активен Universal Web-AR режим (камера + гироскоп + MindAR).');
      return;
    }

    console.log('🌟 [WebXR] Google ARCore Immersive-AR поддерживается!');
    createWebXrPillButton();
  }

  function createWebXrPillButton() {
    let btn = document.getElementById('btn-webxr-toggle');
    if (btn) return;

    btn = document.createElement('button');
    btn.id = 'btn-webxr-toggle';
    btn.innerHTML = '🌟 ARCore: Сканировать пол';
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 20px;
      z-index: 1000;
      background: linear-gradient(135deg, rgba(0, 255, 162, 0.9), rgba(0, 168, 107, 0.95));
      border: 1px solid #00ffa2;
      color: #012415;
      font-weight: bold;
      font-size: 13px;
      padding: 10px 18px;
      border-radius: 24px;
      box-shadow: 0 4px 20px rgba(0, 255, 162, 0.45);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      backdrop-filter: blur(6px);
      transition: transform 0.2s, box-shadow 0.2s;
    `;

    btn.addEventListener('touchstart', () => { btn.style.transform = 'scale(0.95)'; }, { passive: true });
    btn.addEventListener('touchend', () => { btn.style.transform = 'scale(1)'; }, { passive: true });

    btn.addEventListener('click', async () => {
      if (isWebXrActive) {
        stopWebXrSession();
      } else {
        await startWebXrSession();
      }
    });

    document.body.appendChild(btn);
  }

  // 3. Запуск сессии WebXR с Hit-Test (сканирование реального пола и столов)
  async function startWebXrSession() {
    const tRenderer = window.tRenderer;
    const tScene    = window.tScene;
    if (!tRenderer || !tScene) return;

    try {
      console.log('[WebXR] Запрос сессии immersive-ar с hit-test...');
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test']
      });

      xrSession = session;
      isWebXrActive = true;
      window.isWebXrActive = true;

      tRenderer.xr.enabled = true;
      await tRenderer.xr.setSession(session);

      // Создаем кольцо-прицел (Reticle) для индикации найденной поверхности пола
      if (!reticle) {
        const ringGeo = new THREE.RingGeometry(0.15, 0.20, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x00ffa2,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85
        });
        reticle = new THREE.Mesh(ringGeo, ringMat);
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        tScene.add(reticle);
      }

      // Слушатель тапа по экрану для установки урагана на реальную поверхность
      session.addEventListener('select', onWebXrSelect);

      session.addEventListener('end', () => {
        console.log('[WebXR] Сессия завершена.');
        isWebXrActive = false;
        window.isWebXrActive = false;
        xrSession = null;
        xrHitTestSource = null;
        xrHitTestSourceRequested = false;
        if (reticle) reticle.visible = false;
        tRenderer.xr.enabled = false;

        const btn = document.getElementById('btn-webxr-toggle');
        if (btn) btn.innerHTML = '🌟 ARCore: Сканировать пол';

        // Возобновляем стандартный рендер-луп Three.js
        if (window.threeRenderLoop) {
          requestAnimationFrame(window.threeRenderLoop);
        }
      });

      // Получаем пространство отсчета
      xrRefSpace = await session.requestReferenceSpace('local-floor');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      xrHitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      xrHitTestSourceRequested = true;

      const btn = document.getElementById('btn-webxr-toggle');
      if (btn) btn.innerHTML = '❌ Выйти из ARCore';

      // Цикл рендера WebXR
      tRenderer.setAnimationLoop(onWebXrFrame);

      const banner = document.getElementById('swipe-hint-text');
      if (banner) banner.textContent = '🌟 Наведите камеру на пол или стол и нажмите для установки!';

    } catch (err) {
      console.warn('[WebXR] Ошибка запуска сессии:', err);
      alert('Не удалось запустить режим ARCore: ' + (err.message || 'Проверьте разрешения'));
    }
  }

  // 4. Остановка сессии WebXR
  function stopWebXrSession() {
    if (xrSession) {
      xrSession.end();
    }
  }

  // 5. Обработка тапа в режиме WebXR (установка урагана на реальный пол)
  function onWebXrSelect() {
    if (!reticle || !reticle.visible) return;
    const tornadoGroup = window.tornadoGroup;
    const tScene       = window.tScene;

    if (tornadoGroup && tScene) {
      if (tornadoGroup.parent !== tScene) {
        tScene.attach(tornadoGroup);
      }
      tornadoGroup.position.setFromMatrixPosition(reticle.matrix);
      tornadoGroup.scale.setScalar(window.TORNADO_BASE_SCALE || 0.70);
      tornadoGroup.visible = true;
      window.tornadoState = 'ROAMING';

      if (window.sfx && window.sfx.tada) window.sfx.tada();
      if (window.triggerObstacleImpact) {
        window.triggerObstacleImpact(tornadoGroup.position, new THREE.Vector3(0, 1, 0));
      }

      const banner = document.getElementById('swipe-hint-text');
      if (banner) banner.textContent = '🌪️ Ураган на вашем реальном полу! Обходите его вокруг!';
    }
  }

  // 6. Цикл отрисовки кадра WebXR с Hit-Test
  function onWebXrFrame(time, frame) {
    if (!frame) return;

    const tRenderer    = window.tRenderer;
    const tScene       = window.tScene;
    const tCamera      = window.tCamera;
    const tornadoGroup = window.tornadoGroup;

    if (xrHitTestSource && xrRefSpace) {
      const hitTestResults = frame.getHitTestResults(xrHitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(xrRefSpace);
        if (pose && reticle) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
        }
      } else if (reticle) {
        reticle.visible = false;
      }
    }

    // Вращение урагана в WebXR
    if (tornadoGroup && tornadoGroup.visible) {
      tornadoGroup.rotation.y += 0.05;
    }

    if (tRenderer && tScene && tCamera) {
      tRenderer.render(tScene, tCamera);
    }
  }

  // Экспорт
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
