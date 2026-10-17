/**
 * Волшебник Изумрудного Города — Оптический трекинг MindAR и прицеливание на афишу
 * Распознает реальную афишу (targets.mind), проецирует 3D-портал и управляет появлением бури
 */
(function(window) {
  'use strict';

  let mindarController = null;
  let opticalTargetDetected = false;
  let opticalTargetMatrix = null;
  let opticalLastSeenTime = 0;
  let opticalTrackingInitialized = false;
  let postMatrices = [];

  let isAimedAtPoster = false;
  let posterEncounterTriggered = false;
  let aimHoldTime = 0.0;
  let warningHideTimer = null;

  // Экспорт переменных трекинга
  window.opticalTargetDetected = opticalTargetDetected;
  window.posterEncounterTriggered = posterEncounterTriggered;
  window.aimHoldTime = aimHoldTime;

  // Синхронизация проекционной матрицы Three.js с физической камерой устройства
  function updateCameraProjection() {
    const tCamera = window.tCamera;
    const camVideo = document.getElementById('camera-video');
    const threeCont = document.getElementById('three-container');

    if (!mindarController || !tCamera) return;
    const proj = mindarController.getProjectionMatrix();
    if (!proj) return;

    const containerW = threeCont ? (threeCont.clientWidth || window.innerWidth) : window.innerWidth;
    const containerH = threeCont ? (threeCont.clientHeight || window.innerHeight) : window.innerHeight;
    const vW = (camVideo && camVideo.videoWidth) ? camVideo.videoWidth : 640;
    const vH = (camVideo && camVideo.videoHeight) ? camVideo.videoHeight : 480;
    const containerAspect = containerW / containerH;

    const c = mindarController.inputWidth / mindarController.inputHeight;
    let d;
    if (c > containerAspect) {
      d = vW / mindarController.inputWidth;
    } else {
      d = vH / mindarController.inputHeight;
    }
    let h;
    if (c > containerAspect) {
      h = containerH * d;
    } else {
      h = (containerW / mindarController.inputWidth) * mindarController.inputHeight * d;
    }
    const g = containerH / h;
    const fov = 2 * Math.atan((1 / proj[5]) * g) * (180 / Math.PI);
    const near = proj[14] / (proj[10] - 1);
    const far = proj[14] / (proj[10] + 1);

    tCamera.fov = fov;
    tCamera.near = Math.max(0.01, Math.min(near, 0.1));
    tCamera.far = Math.max(100, far);
    tCamera.aspect = containerAspect;
    tCamera.updateProjectionMatrix();
  }

  // Запуск оптического трекера MindAR на видеопотоке
  async function initOpticalTracking(videoEl) {
    if (opticalTrackingInitialized || !videoEl) return;
    if (!window.MindARController) {
      window.addEventListener('mindar-loaded', () => initOpticalTracking(videoEl), { once: true });
      return;
    }

    try {
      if (!videoEl.videoWidth || !videoEl.videoHeight) {
        await new Promise(resolve => {
          if (videoEl.videoWidth && videoEl.videoHeight) return resolve();
          videoEl.addEventListener('loadedmetadata', resolve, { once: true });
          setTimeout(resolve, 800);
        });
      }
      const vWidth = videoEl.videoWidth || 640;
      const vHeight = videoEl.videoHeight || 480;

      console.log(`[OpticalAR] Starting MindAR Controller (${vWidth}x${vHeight})...`);
      mindarController = new window.MindARController({
        inputWidth: vWidth,
        inputHeight: vHeight,
        filterMinCF: 0.0001,
        filterBeta: 1000,
        warmupTolerance: 2,
        missTolerance: 6,
        onUpdate: (data) => {
          if (data.type === 'updateMatrix') {
            const dioramaGroup = window.dioramaGroup;
            const posterGroup = window.posterGroup;

            if (data.worldMatrix !== null) {
              opticalTargetDetected = true;
              window.opticalTargetDetected = true;
              opticalTargetMatrix = data.worldMatrix;
              opticalLastSeenTime = performance.now();

              // Матрица трансформации относительно камеры
              const m = new THREE.Matrix4().fromArray(data.worldMatrix);
              if (postMatrices && postMatrices[data.targetIndex || 0]) {
                m.multiply(postMatrices[data.targetIndex || 0]);
              }

              if (dioramaGroup) {
                dioramaGroup.matrix.copy(m);
                dioramaGroup.matrixAutoUpdate = false;
                dioramaGroup.matrixWorldNeedsUpdate = true;
                dioramaGroup.visible = true;
              }
              if (posterGroup) {
                posterGroup.visible = true;
              }

              if (window.tornadoState === 'WAITING_FOR_POSTER') {
                triggerPosterEncounter();
              }
            } else {
              opticalTargetDetected = false;
              window.opticalTargetDetected = false;
              if (window.tornadoState === 'WAITING_FOR_POSTER') {
                if (dioramaGroup) dioramaGroup.visible = false;
              }
            }
          }
        }
      });

      console.log('[OpticalAR] Loading targets.mind...');
      const targetRes = await mindarController.addImageTargets('targets.mind?v=' + Date.now());
      console.log('[OpticalAR] Target compiled data loaded! Result:', targetRes);

      const dimensions = targetRes && targetRes.dimensions ? targetRes.dimensions : [[1, 1.48026]];
      postMatrices = [];
      for (let n = 0; n < dimensions.length; n++) {
        const [p, m] = dimensions[n];
        const u = new THREE.Vector3(p / 2, p / 2 + (m - p) / 2, 0);
        const o = new THREE.Quaternion();
        const l = new THREE.Vector3(p, p, p);
        const c = new THREE.Matrix4().compose(u, o, l);
        postMatrices.push(c);
      }

      updateCameraProjection();
      console.log('[OpticalAR] Camera projection synchronized! Beginning continuous video tracking...');
      mindarController.processVideo(videoEl);
      opticalTrackingInitialized = true;
      window.opticalTrackingInitialized = true;
      window.mindarController = mindarController;
    } catch (err) {
      console.warn('[OpticalAR] Failed to start optical tracking:', err);
    }
  }

  // Резервное позиционирование диорамы для виртуального режима (без камеры/афиши)
  function setupFallbackDioramaPose() {
    const dioramaGroup = window.dioramaGroup;
    const posterGroup = window.posterGroup;
    if (dioramaGroup) {
      dioramaGroup.position.set(0, 0.08, -1.25);
      dioramaGroup.rotation.set(-0.12, 0, 0);
      dioramaGroup.scale.setScalar(1.0);
      dioramaGroup.updateMatrix();
      dioramaGroup.matrixAutoUpdate = false;
      dioramaGroup.matrixWorldNeedsUpdate = true;
      dioramaGroup.visible = true;
    }
    if (posterGroup) posterGroup.visible = true;
  }

  // Проверка наведения смартфона на афишу
  function checkAimAtPoster() {
    if (opticalTargetDetected === true) return true;

    const tCamera = window.tCamera;
    const camGyroPitch = window.camGyroPitch || 0;
    const camGyroYaw = window.camGyroYaw || 0;

    if (tCamera) {
      const isPitchForward = (camGyroPitch > -0.32 && camGyroPitch < 0.28);
      const isYawForward   = (Math.abs(camGyroYaw) < 0.42);
      if (isPitchForward && isYawForward) {
        return true;
      }
    }
    return false;
  }

  // Срабатывание встречи с афишей
  function triggerPosterEncounter() {
    if (posterEncounterTriggered) return;
    posterEncounterTriggered = true;
    window.posterEncounterTriggered = true;

    const dioramaGroup = window.dioramaGroup;
    const posterGroup = window.posterGroup;

    if (!opticalTargetDetected) {
      setupFallbackDioramaPose();
    }
    if (dioramaGroup) dioramaGroup.visible = true;
    if (posterGroup) posterGroup.visible = true;

    if (window.doFlash) window.doFlash('rgba(0, 255, 162, 0.7)', 350);
    if (window.sfx && window.sfx.chime) window.sfx.chime();

    const prompt = document.getElementById('ar-target-prompt');
    if (prompt) prompt.style.display = 'none';

    // Через 450мс ураган вырывается из глубины афиши в комнату
    setTimeout(() => {
      if (window.startTornadoEruption) {
        window.startTornadoEruption();
      }
    }, 450);
  }

  // Экспорт
  window.updateCameraProjection     = updateCameraProjection;
  window.initOpticalTracking        = initOpticalTracking;
  window.setupFallbackDioramaPose   = setupFallbackDioramaPose;
  window.checkAimAtPoster           = checkAimAtPoster;
  window.triggerPosterEncounter     = triggerPosterEncounter;

})(window);
