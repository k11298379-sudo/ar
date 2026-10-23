/**
 * Волшебник Изумрудного Города — Модуль WebXR Immersive-AR (Google ARCore)
 * Обеспечивает настоящее сканирование физического пола и стен через Google ARCore Hit-Test.
 * Работает аппаратно на уровне датчиков ОС в поддерживаемых браузерах (Chrome, Samsung Internet, Edge).
 * Для остальных браузеров (Safari на iOS, Mi Browser и др.) действует стабильный Universal Web-AR режим.
 */
(function(window) {
  'use strict';

  let xrSession = null;
  let xrRefSpace = null;
  let xrHitTestSource = null;
  let isWebXrActive = false;
  let reticleGroup = null;
  let reticleRing = null;
  let reticleDot = null;
  let detectedSurfaceType = 'NONE'; // 'FLOOR', 'WALL', 'SLOPE', 'NONE'
  let lastHitPos = new THREE.Vector3();
  let lastHitNormal = new THREE.Vector3(0, 1, 0);

  // Целевая позиция урагана на реальном полу
  let tornadoTargetFloorPos = null;
  let wallImpactActive = false;

  window.isWebXrActive = false;

  // ─── 1. ПРОВЕРКА ПОДДЕРЖКИ WEBXR IMMERSIVE-AR ──────────
  async function checkWebXrSupport() {
    if (!navigator.xr || typeof navigator.xr.isSessionSupported !== 'function') {
      return false;
    }
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      return !!supported;
    } catch (e) {
      console.warn('[WebXR] Проверка поддержки:', e);
      return false;
    }
  }

  // ─── 2. ИНИЦИАЛИЗАЦИЯ И СОЗДАНИЕ КНОПКИ В ИНТЕРФЕЙСЕ ────
  async function initWebXrEngine() {
    const isSupported = await checkWebXrSupport();
    if (!isSupported) {
      console.log('ℹ️ [WebXR] Нативный Immersive-AR не поддерживается в этом браузере. Активен режим Universal Web-AR (MindAR).');
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
    btn.innerHTML = '🌟 <span>ARCore: Реальный пол и стены</span>';
    btn.style.cssText = `
      position: fixed;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: linear-gradient(135deg, rgba(0, 255, 162, 0.95), rgba(0, 168, 107, 0.95));
      border: 1.5px solid #00ffa2;
      color: #012415;
      font-weight: 700;
      font-size: 13.5px;
      padding: 11px 22px;
      border-radius: 30px;
      box-shadow: 0 4px 25px rgba(0, 255, 162, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.4);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      backdrop-filter: blur(8px);
      white-space: nowrap;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: inherit;
    `;

    btn.addEventListener('touchstart', () => { btn.style.transform = 'translateX(-50%) scale(0.96)'; }, { passive: true });
    btn.addEventListener('touchend', () => { btn.style.transform = 'translateX(-50%) scale(1.0)'; }, { passive: true });

    btn.addEventListener('click', async () => {
      if (isWebXrActive) {
        stopWebXrSession();
      } else {
        await startWebXrSession();
      }
    });

    document.body.appendChild(btn);
  }

  // ─── 3. 3D-ПРИЦЕЛ СКАНЕРА ПОВЕРХНОСТЕЙ (RETICLE) ────────
  function createReticle(scene) {
    if (reticleGroup) return reticleGroup;

    reticleGroup = new THREE.Group();
    reticleGroup.name = "ARCore_Surface_Reticle";
    reticleGroup.matrixAutoUpdate = false;
    reticleGroup.visible = false;

    // Внешнее светящееся кольцо
    const ringGeo = new THREE.RingGeometry(0.14, 0.17, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffa2,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.90
    });
    reticleRing = new THREE.Mesh(ringGeo, ringMat);
    reticleGroup.add(reticleRing);

    // Внутренняя пульсирующая точка-маркер
    const dotGeo = new THREE.CircleGeometry(0.035, 24);
    dotGeo.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x00ffa2,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    reticleDot = new THREE.Mesh(dotGeo, dotMat);
    reticleDot.position.y = 0.002;
    reticleGroup.add(reticleDot);

    // 4 луча-указателя по сторонам
    for (let i = 0; i < 4; i++) {
      const armGeo = new THREE.PlaneGeometry(0.015, 0.05);
      armGeo.rotateX(-Math.PI / 2);
      const arm = new THREE.Mesh(armGeo, ringMat);
      arm.rotation.y = (i * Math.PI) / 2;
      arm.translateZ(0.20);
      reticleGroup.add(arm);
    }

    scene.add(reticleGroup);
    return reticleGroup;
  }

  // ─── 4. ЗАПУСК СЕССИИ WEBXR HIT-TEST ────────────────────
  async function startWebXrSession() {
    const tRenderer = window.tRenderer;
    const tScene    = window.tScene;
    if (!tRenderer || !tScene) return;

    try {
      console.log('[WebXR] Запрос сессии immersive-ar с аппаратным hit-test...');

      // Приостанавливаем захват через HTML5 <video>, чтобы освободить камеру для ARCore
      const camVideo = document.getElementById('camera-video');
      if (camVideo && camVideo.srcObject) {
        camVideo.srcObject.getTracks().forEach(t => { t.enabled = false; });
        camVideo.style.opacity = '0';
      }

      // Приостанавливаем стандартный цикл рендеринга
      if (window.stopThreeScene1) window.stopThreeScene1();

      const stageRoot = document.getElementById('ar-stage') || document.body;
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'light-estimation'],
        domOverlay: { root: stageRoot }
      });

      xrSession = session;
      isWebXrActive = true;
      window.isWebXrActive = true;

      tRenderer.xr.enabled = true;
      await tRenderer.xr.setSession(session);

      // Инициализируем 3D-прицел поверхностей
      createReticle(tScene);

      // Пространство отсчета пола и видоискателя
      xrRefSpace = await session.requestReferenceSpace('local-floor');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      xrHitTestSource = await session.requestHitTestSource({ space: viewerSpace });

      // Переводим ураган в глобальное пространство tScene, если он был в диораме
      const tornadoGroup = window.tornadoGroup;
      if (tornadoGroup && tornadoGroup.parent !== tScene) {
        tScene.attach(tornadoGroup);
        tornadoGroup.scale.setScalar(window.TORNADO_BASE_SCALE || 0.70);
        tornadoGroup.visible = true;
      }

      // Слушатель касания для установки урагана на реальный пол или удара о стену
      session.addEventListener('select', onWebXrSelect);

      session.addEventListener('end', onWebXrSessionEnded);

      const btn = document.getElementById('btn-webxr-toggle');
      if (btn) {
        btn.innerHTML = '❌ <span>Выйти из ARCore</span>';
        btn.style.background = 'rgba(15, 23, 42, 0.9)';
        btn.style.color = '#f1f5f9';
        btn.style.borderColor = '#475569';
      }

      // Назначаем цикл отрисовки WebXR
      tRenderer.setAnimationLoop(onWebXrFrame);

      const hintText = document.getElementById('swipe-hint-text');
      if (hintText) {
        hintText.textContent = '🌟 ARCore активен! Наведите камеру на пол или стену комнаты';
      }

      const prompt = document.getElementById('ar-target-prompt');
      if (prompt) prompt.style.display = 'none';

      if (window.sfx && window.sfx.chime) window.sfx.chime();

    } catch (err) {
      console.warn('[WebXR] Ошибка запуска сессии:', err);
      alert('Не удалось запустить режим Google ARCore: ' + (err.message || 'Проверьте поддержку WebXR в браузере'));
      onWebXrSessionEnded();
    }
  }

  // ─── 5. ЗАВЕРШЕНИЕ СЕССИИ WEBXR ─────────────────────────
  function stopWebXrSession() {
    if (xrSession) {
      xrSession.end();
    }
  }

  function onWebXrSessionEnded() {
    console.log('[WebXR] Сессия ARCore завершена, возврат в универсальный режим.');
    isWebXrActive = false;
    window.isWebXrActive = false;
    xrSession = null;
    xrHitTestSource = null;

    if (reticleGroup) reticleGroup.visible = false;

    const tRenderer = window.tRenderer;
    if (tRenderer) {
      tRenderer.setAnimationLoop(null);
      tRenderer.xr.enabled = false;
    }

    // Возобновляем стандартное видео камеры
    const camVideo = document.getElementById('camera-video');
    if (camVideo && camVideo.srcObject) {
      camVideo.srcObject.getTracks().forEach(t => { t.enabled = true; });
      camVideo.style.opacity = '1';
    }

    const btn = document.getElementById('btn-webxr-toggle');
    if (btn) {
      btn.innerHTML = '🌟 <span>ARCore: Реальный пол и стены</span>';
      btn.style.background = 'linear-gradient(135deg, rgba(0, 255, 162, 0.95), rgba(0, 168, 107, 0.95))';
      btn.style.color = '#012415';
      btn.style.borderColor = '#00ffa2';
    }

    // Возвращаем ураган в диораму
    const tornadoGroup = window.tornadoGroup;
    const dioramaGroup = window.dioramaGroup;
    if (tornadoGroup && dioramaGroup && tornadoGroup.parent !== dioramaGroup) {
      dioramaGroup.add(tornadoGroup);
      tornadoGroup.position.copy(window.TORNADO_ROOM_DEFAULT);
    }

    // Возобновляем стандартный цикл Three.js
    if (window.S.scene === 1 && window.initThreeScene1) {
      requestAnimationFrame(window.threeRenderLoop);
    }
  }

  // ─── 6. КЛИК / ТАП ПО ЭКРАНУ В РЕЖИМЕ WEBXR ─────────────
  function onWebXrSelect() {
    if (!reticleGroup || !reticleGroup.visible) return;
    const tornadoGroup = window.tornadoGroup;
    if (!tornadoGroup) return;

    if (detectedSurfaceType === 'WALL') {
      // 🧱 УДАР УРАГАНА О СТЕНУ!
      triggerWallImpact(lastHitPos, lastHitNormal);
    } else {
      // 🟢 ПЕРЕМЕЩЕНИЕ УРАГАНА ПО РЕАЛЬНОМУ ПОЛУ!
      placeTornadoOnRealFloor(lastHitPos);
    }
  }

  function placeTornadoOnRealFloor(pos) {
    const tornadoGroup = window.tornadoGroup;
    if (!tornadoGroup) return;

    tornadoTargetFloorPos = pos.clone();
    window.tornadoSquashTarget = 0.75;

    if (window.triggerObstacleImpact) {
      window.triggerObstacleImpact(pos, new THREE.Vector3(0, 1, 0));
    }
    if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();

    const hintText = document.getElementById('swipe-hint-text');
    if (hintText) {
      hintText.textContent = '🌪️ Ураган на вашем реальном полу! Смахните его пальцем!';
    }
  }

  function triggerWallImpact(pos, normal) {
    const tornadoGroup = window.tornadoGroup;
    if (!tornadoGroup) return;

    wallImpactActive = true;
    window.tornadoSquashTarget = 0.45; // Сильная деформация сжатия об стену

    if (window.triggerObstacleImpact) {
      window.triggerObstacleImpact(pos, normal);
    }
    if (window.sfx && window.sfx.snap) window.sfx.snap();
    if (navigator.vibrate) navigator.vibrate([60, 40, 80]);

    if (window.doFlash) window.doFlash('rgba(56, 189, 248, 0.45)', 200);

    const hintText = document.getElementById('swipe-hint-text');
    if (hintText) {
      hintText.textContent = '💥 Ураган ударился о реальную стену комнаты!';
    }

    // Отскок от стены обратно в комнату
    setTimeout(() => {
      wallImpactActive = false;
      if (tornadoTargetFloorPos) {
        tornadoTargetFloorPos.addScaledVector(normal, 0.35);
      }
    }, 450);
  }

  // ─── 7. КАДРОВЫЙ ЦИКЛ WEBXR С АППАРАТНЫМ HIT-TEST ────────
  function onWebXrFrame(time, frame) {
    if (!frame || !isWebXrActive) return;

    const tRenderer    = window.tRenderer;
    const tScene       = window.tScene;
    const tCamera      = window.tCamera;
    const tClock       = window.tClock;
    const tornadoGroup = window.tornadoGroup;

    const dt = Math.min(tClock ? tClock.getDelta() : 0.016, 0.05);
    const elapsed = tClock ? tClock.getElapsedTime() : (time * 0.001);

    // 1. Аппаратный Hit-Test (сканирование лазерным лучом пола и стен)
    if (xrHitTestSource && xrRefSpace) {
      const hitTestResults = frame.getHitTestResults(xrHitTestSource);

      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(xrRefSpace);

        if (pose && reticleGroup) {
          reticleGroup.visible = true;
          reticleGroup.matrix.fromArray(pose.transform.matrix);

          // Извлекаем мировую позицию
          lastHitPos.setFromMatrixPosition(reticleGroup.matrix);

          // Извлекаем нормаль поверхности (Y-компонента базиса матрицы)
          const m = pose.transform.matrix;
          lastHitNormal.set(m[4], m[5], m[6]).normalize();

          // Определение типа поверхности:
          // Если нормаль смотрит строго вверх (ny > 0.65) — это горизонтальный пол / стол
          // Если нормаль почти горизонтальна (abs(ny) < 0.40) — это вертикальная стена
          const ny = lastHitNormal.y;
          const hint = document.getElementById('swipe-hint-text');

          if (ny > 0.65) {
            detectedSurfaceType = 'FLOOR';
            reticleRing.material.color.setHex(0x00ffa2); // Зеленый изумрудный
            reticleDot.material.color.setHex(0x00ffa2);
            if (hint && !tornadoTargetFloorPos) {
              hint.textContent = '🟢 Пол обнаружен! Коснитесь экрана, чтобы посадить ураган';
            }
          } else if (Math.abs(ny) < 0.40) {
            detectedSurfaceType = 'WALL';
            reticleRing.material.color.setHex(0x38bdf8); // Голубой (стена)
            reticleDot.material.color.setHex(0x38bdf8);
            if (hint) {
              hint.textContent = '🧱 Стена обнаружена! Коснитесь, чтобы направить ураган в стену';
            }
          } else {
            detectedSurfaceType = 'SLOPE';
            reticleRing.material.color.setHex(0xf59e0b); // Янтарный (наклон)
            reticleDot.material.color.setHex(0xf59e0b);
          }

          // Анимация пульсации прицела
          const pulse = 1.0 + Math.sin(elapsed * 6.0) * 0.08;
          reticleRing.scale.set(pulse, 1, pulse);
        }
      } else if (reticleGroup) {
        reticleGroup.visible = false;
        detectedSurfaceType = 'NONE';
      }
    }

    // 2. Движение урагана к целевой точке на реальном полу
    if (tornadoGroup && tornadoTargetFloorPos) {
      tornadoGroup.position.lerp(tornadoTargetFloorPos, dt * 5.5);

      // Легкое парение над поверхностью
      const hoverY = Math.sin(elapsed * 3.5) * 0.02;
      tornadoGroup.position.y = tornadoTargetFloorPos.y + hoverY;

      const floorContactMesh = window.floorContactMesh;
      if (floorContactMesh) {
        floorContactMesh.visible = true;
        floorContactMesh.position.set(0, 0.005, 0);
      }
    }

    // 3. Вызов общего цикла спецэффектов (вихрь, кольца, пыль, домик)
    if (window.updateScene1VFX) {
      window.updateScene1VFX(dt, elapsed, time);
    }

    // 4. Рендеринг через Three.js WebXRManager (камера управляется ARCore в 6DOF)
    if (tRenderer && tScene && tCamera) {
      tRenderer.render(tScene, tCamera);
    }
  }

  // ─── 8. ЭКСПОРТ ─────────────────────────────────────────
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
