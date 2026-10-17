/**
 * Волшебник Изумрудного Города — Сцена 1: 3D AR Ураган, гироскоп, свайпы и падение домика
 */
(function(window) {
  'use strict';

  let tScene, tCamera, tRenderer, tClock;
  let tAnimId = null;
  let dioramaGroup;
  let vortexLight;

  // Игровые состояния Сцены 1
  let swipeCount = 0;
  let houseState = 'ORBITING'; // 'ORBITING' | 'LAUNCHING' | 'LANDED'
  let tornadoTiltCurrent = { x: 0, z: 0 };
  let tornadoTiltTarget  = { x: 0, z: 0 };
  let tornadoSpeedMult   = 1.0;
  let tornadoBlowAway    = false;
  let tornadoBlowVel     = new THREE.Vector3();
  let tornadoOpacity     = 1.0;

  // Состояние вихря:
  // 'WAITING_FOR_POSTER' — вихря нет до наведения на афишу
  // 'ERUPTING' — вырывается из глубины афиши в комнату
  // 'ROAMING' — приземлился на поверхность (стол/пол), управляем
  let tornadoState = 'WAITING_FOR_POSTER';
  let eruptionStartTime = 0;
  const ERUPTION_DURATION = 2100;
  let tornadoVel = new THREE.Vector3(0, 0, 0);

  // Гироскоп и ориентация камеры (~-18° естественный наклон камеры на пол/стол)
  let gyroActive = false;
  let camGyroPitch = -0.32, camGyroYaw = 0;

  // Полёт домика
  const houseFlight = {
    startTime: 0,
    duration: 1400,
    startPos: new THREE.Vector3(),
    startRot: new THREE.Euler(),
    targetPos: new THREE.Vector3()
  };

  let houseBouncePhase = 0;
  let witchSquash = 1.0;
  let legsSlide = 0.0;

  // Жесты свайпа и неоновый след
  let isPointerDown = false;
  let pointerStart = { x: 0, y: 0, time: 0 };
  let pointerLast  = { x: 0, y: 0 };
  let swipeTrailPoints = [];
  let swipeCanvasCtx = null;
  let isCamDrag = false;
  let camDragStart = { x: 0, y: 0 };

  // Экспорт переменных для глобального доступа
  window.tornadoState       = tornadoState;
  window.houseState         = houseState;
  window.tornadoVel         = tornadoVel;
  window.camGyroPitch       = camGyroPitch;
  window.camGyroYaw         = camGyroYaw;
  window.tornadoTiltTarget  = tornadoTiltTarget;

  // ─── ИНИЦИАЛИЗАЦИЯ THREE.JS СЦЕНЫ 1 ───────────────────
  function initThreeScene1() {
    const threeCont = document.getElementById('three-container');
    if (!threeCont) return;

    // 1. Сцена и прозрачный WebGL-рендерер (видео камеры просвечивает насквозь)
    tScene = new THREE.Scene();
    window.tScene = tScene;

    const w = threeCont.clientWidth || window.innerWidth;
    const h = threeCont.clientHeight || window.innerHeight;
    const aspect = w / h;

    tCamera = new THREE.PerspectiveCamera(aspect < 1 ? 55 : 46, aspect, 0.05, 100);
    tCamera.position.set(0, 0, 0);
    tCamera.rotation.set(0, 0, 0);
    window.tCamera = tCamera;

    tRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    tRenderer.setSize(w, h);
    tRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    tRenderer.setClearColor(0x000000, 0);
    tRenderer.shadowMap.enabled = true;
    tRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    threeCont.appendChild(tRenderer.domElement);
    window.tRenderer = tRenderer;

    tClock = new THREE.Clock();
    window.tClock = tClock;

    // 2. Освещение
    const hemiLight = new THREE.HemisphereLight(0xdcfce7, 0x1e293b, 1.0);
    hemiLight.position.set(0, 15, 0);
    tScene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.4);
    dirLight.position.set(3, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    tScene.add(dirLight);

    // 3. Корневая группа диорамы (привязывается к афише через MindAR)
    dioramaGroup = new THREE.Group();
    dioramaGroup.name = "AR_Poster_Clearing_Diorama";
    dioramaGroup.matrixAutoUpdate = false;
    dioramaGroup.visible = false;
    tScene.add(dioramaGroup);
    window.dioramaGroup = dioramaGroup;

    vortexLight = new THREE.PointLight(0x38bdf8, 1.5, 4.0);
    vortexLight.position.set(0, 0.5, 0.2);
    dioramaGroup.add(vortexLight);
    window.vortexLight = vortexLight;

    const fairyLight = new THREE.PointLight(0x84cc16, 1.2, 2.5);
    fairyLight.position.set(0.04, 0.25, -0.05);
    dioramaGroup.add(fairyLight);

    // 4. Создание текстур и 3D-моделей
    if (window.generateAllTextures) window.generateAllTextures();
    if (window.createPosterAndClearing) window.createPosterAndClearing();
    if (window.createWitchCottage) window.createWitchCottage();
    if (window.createTornado) window.createTornado();
    if (window.createHouse) window.createHouse();
    if (window.createDustBurstSystem) window.createDustBurstSystem();
    if (window.createStarSparkles) window.createStarSparkles();

    // 5. Холст свайпа, события и гироскоп
    setupSwipeTrailCanvas();
    setupSwipeEvents();
    initGyroscope();

    const camVideo = document.getElementById('camera-video');
    if (camVideo && camVideo.srcObject && window.initOpticalTracking) {
      window.initOpticalTracking(camVideo);
    }

    window.addEventListener('resize', onThreeResize);

    // Исходное состояние: урагана нет до обнаружения афиши
    tornadoState = 'WAITING_FOR_POSTER';
    window.tornadoState = tornadoState;
    if (window.tornadoGroup) {
      window.tornadoGroup.position.copy(window.TORNADO_POSTER_POS);
      window.tornadoGroup.scale.setScalar(0.02);
      window.tornadoGroup.visible = false;
    }
    if (window.houseGroup) window.houseGroup.visible = false;
    if (window.floorContactMesh) window.floorContactMesh.visible = false;
    if (window.posterGroup) window.posterGroup.visible = false;
    if (dioramaGroup) dioramaGroup.visible = false;

    swipeCount = 0;
    window.posterEncounterTriggered = false;
    window.aimHoldTime = 0.0;

    // 6. Запуск цикла рендеринга
    tAnimId = requestAnimationFrame(threeRenderLoop);
  }

  function onThreeResize() {
    const threeCont = document.getElementById('three-container');
    const swipeTrailEl = document.getElementById('swipe-trail');
    if (!tCamera || !tRenderer || !threeCont) return;

    const w = threeCont.clientWidth || window.innerWidth;
    const h = threeCont.clientHeight || window.innerHeight;
    tRenderer.setSize(w, h);

    if (swipeTrailEl) {
      swipeTrailEl.width = w;
      swipeTrailEl.height = h;
    }
    if (window.mindarController && window.opticalTrackingInitialized && window.updateCameraProjection) {
      window.updateCameraProjection();
    } else {
      const aspect = w / h;
      tCamera.aspect = aspect;
      tCamera.fov = aspect < 1 ? 55 : 46;
      tCamera.updateProjectionMatrix();
    }
  }

  // ─── ГИРОСКОП СМАРТФОНА ───────────────────────────────
  function initGyroscope() {
    if (typeof DeviceOrientationEvent !== 'undefined') {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(resp => {
          if (resp === 'granted') {
            window.addEventListener('deviceorientation', onOrientationChange);
          }
        }).catch(() => {});
      } else {
        window.addEventListener('deviceorientation', onOrientationChange);
      }
    }
  }

  function onOrientationChange(e) {
    if (e.beta === null) return;
    gyroActive = true;

    // В портретном режиме (на смартфоне):
    // e.beta: 90° = телефон вертикально (pitch = 0°)
    // e.beta: 45°..65° = телефон наклонен вперед на стол/пол (pitch = -25°..-45°)
    const targetPitch = (e.beta - 90) * (Math.PI / 180);
    camGyroPitch = THREE.MathUtils.clamp(targetPitch, -1.15, 0.45);
    window.camGyroPitch = camGyroPitch;

    if (e.gamma !== null) {
      const gNorm = THREE.MathUtils.clamp(e.gamma / 45, -1, 1);
      camGyroYaw = THREE.MathUtils.clamp(-gNorm * 0.45, -0.65, 0.65);
      window.camGyroYaw = camGyroYaw;
    }
  }

  // ─── ВЫРЫВАНИЕ УРАГАНА ИЗ АФИШИ ────────────────────────
  function startTornadoEruption() {
    tornadoState = 'ERUPTING';
    window.tornadoState = tornadoState;
    eruptionStartTime = performance.now();

    if (window.tornadoGroup) {
      window.tornadoGroup.position.copy(window.TORNADO_POSTER_POS);
      window.tornadoGroup.scale.setScalar(0.02);
      window.tornadoGroup.visible = true;
    }

    if (window.houseGroup) window.houseGroup.visible = false;
    if (window.floorContactMesh) window.floorContactMesh.visible = false;

    if (window.sfx) {
      if (window.sfx.wind) window.sfx.wind(0.5);
      if (window.sfx.snap) window.sfx.snap();
    }

    const hint = document.getElementById('swipe-hint-text');
    if (hint) {
      hint.textContent = '🌪️ ИЗ АФИШИ ВЫРЫВАЕТСЯ УРАГАН!';
    }
  }

  // ─── ХОЛСТ СВАЙПА И ОБРАБОТЧИКИ ────────────────────────
  function setupSwipeTrailCanvas() {
    const swipeTrailEl = document.getElementById('swipe-trail');
    if (!swipeTrailEl) return;
    swipeTrailEl.width = window.innerWidth;
    swipeTrailEl.height = window.innerHeight;
    swipeCanvasCtx = swipeTrailEl.getContext('2d');
  }

  function setupSwipeEvents() {
    const threeCont = document.getElementById('three-container');
    if (!threeCont) return;

    threeCont.addEventListener('pointerdown', e => {
      if (window.S.scene !== 1 || houseState !== 'ORBITING') return;
      if (e.button === 2) {
        // ПК: правая кнопка для вращения камеры
        isCamDrag = true;
        camDragStart = { x: e.clientX, y: e.clientY };
        return;
      }
      isPointerDown = true;
      pointerStart = { x: e.clientX, y: e.clientY, time: performance.now() };
      pointerLast  = { x: e.clientX, y: e.clientY };
      swipeTrailPoints.push({ x: e.clientX, y: e.clientY, time: performance.now() });
      if (window.getCtx) window.getCtx();
    });

    window.addEventListener('pointermove', e => {
      if (isCamDrag) {
        const dx = e.clientX - camDragStart.x;
        const dy = e.clientY - camDragStart.y;
        camGyroYaw   += (dx / window.innerWidth) * 1.5;
        camGyroPitch -= (dy / window.innerHeight) * 1.5;
        camGyroPitch  = THREE.MathUtils.clamp(camGyroPitch, -1.15, 0.45);
        window.camGyroPitch = camGyroPitch;
        window.camGyroYaw = camGyroYaw;
        camDragStart = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!isPointerDown || window.S.scene !== 1) return;
      pointerLast = { x: e.clientX, y: e.clientY };
      swipeTrailPoints.push({ x: e.clientX, y: e.clientY, time: performance.now() });

      const dx = e.clientX - pointerStart.x;
      tornadoTiltTarget.z = -(dx / window.innerWidth) * 0.85;
    });

    const endSwipe = () => {
      isCamDrag = false;
      if (!isPointerDown || window.S.scene !== 1) return;
      isPointerDown = false;
      const dt = performance.now() - pointerStart.time;
      const dx = pointerLast.x - pointerStart.x;
      const dy = pointerLast.y - pointerStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = dist / (dt || 1);

      if (dist > 26 || (speed > 0.25 && dist > 14)) {
        handleSwipeGesture(dx, dy);
      } else if (dist < 14 && dt < 320) {
        if (window.handleSurfaceTap) window.handleSurfaceTap(pointerLast.x, pointerLast.y);
      } else {
        tornadoTiltTarget.z = 0;
      }
    };

    window.addEventListener('pointerup', endSwipe);
    window.addEventListener('pointercancel', endSwipe);

    const btnForcePoster = document.getElementById('btn-force-poster');
    if (btnForcePoster) {
      btnForcePoster.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.getCtx) window.getCtx();
        if (window.triggerPosterEncounter) window.triggerPosterEncounter();
      });
    }

    const arTargetPrompt = document.getElementById('ar-target-prompt');
    if (arTargetPrompt) {
      arTargetPrompt.addEventListener('click', () => {
        if (window.getCtx) window.getCtx();
        if (window.triggerPosterEncounter) window.triggerPosterEncounter();
      });
    }

    const swipeHint = document.getElementById('swipe-hint');
    if (swipeHint) {
      swipeHint.addEventListener('click', () => {
        if (window.S.scene === 1 && houseState === 'ORBITING' && tornadoState === 'ROAMING') {
          handleSwipeGesture(0, -60);
        }
      });
    }
  }

  // ─── МЕХАНИКА 2-Х СВАЙПОВ И СМАХИВАНИЕ ─────────────────
  let warningHideTimer = null;

  function handleSwipeGesture(dx, dy) {
    const arWarningBanner = document.getElementById('ar-warning-banner');
    const swipeHintText = document.getElementById('swipe-hint-text');
    const gem1 = document.getElementById('gem-1');
    const gem2 = document.getElementById('gem-2');

    if (tornadoState === 'WAITING_FOR_POSTER') {
      if (window.checkAimAtPoster && window.checkAimAtPoster()) {
        if (window.triggerPosterEncounter) window.triggerPosterEncounter();
      } else if (arWarningBanner) {
        arWarningBanner.style.display = 'block';
        clearTimeout(warningHideTimer);
        warningHideTimer = setTimeout(() => {
          if (arWarningBanner) arWarningBanner.style.display = 'none';
        }, 2200);
      }
      return;
    }
    if (houseState !== 'ORBITING' || tornadoState !== 'ROAMING') return;

    const aimed = window.checkAimAtPoster ? window.checkAimAtPoster() : true;

    if (!aimed) {
      // Свободный смах по комнате
      const pushX = THREE.MathUtils.clamp((dx / window.innerWidth) * 4.8, -3.5, 3.5);
      const pushZ = THREE.MathUtils.clamp((dy / window.innerHeight) * 4.8, -3.5, 3.5);
      tornadoVel.x += pushX;
      tornadoVel.z += pushZ;

      if (dy < -80 && window.setObstacleElevation) {
        window.setObstacleElevation((window.groundElevationTarget || -0.78) + 0.32);
      } else if (dy > 80 && window.setObstacleElevation) {
        window.setObstacleElevation(Math.max(0.0, (window.groundElevationTarget || -0.78) - 0.32));
      }

      tornadoTiltTarget.z = -(dx / window.innerWidth) * 0.95;
      tornadoTiltTarget.x = (dy / window.innerHeight) * 0.95;
      if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();

      if (arWarningBanner) {
        arWarningBanner.style.display = 'block';
        clearTimeout(warningHideTimer);
        warningHideTimer = setTimeout(() => {
          if (arWarningBanner) arWarningBanner.style.display = 'none';
        }, 2200);
      }
      return;
    }

    // Камера наведена на афишу — результативный свайп
    if (arWarningBanner) arWarningBanner.style.display = 'none';
    swipeCount++;
    if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();

    if (swipeCount === 1) {
      if (gem1) { gem1.classList.add('active'); gem1.textContent = '⚡'; }
      tornadoTiltTarget.z = -(dx >= 0 ? 1 : -1) * 0.65;
      tornadoTiltTarget.x = 0.45;
      tornadoSpeedMult = 0.75;
      tornadoVel.z -= 3.5;
      if (window.sfx && window.sfx.snap) window.sfx.snap();
      if (window.doFlash) window.doFlash('rgba(0, 255, 162, 0.45)', 180);
      if (swipeHintText) swipeHintText.textContent = '⚡ 1-й свайп! Ураган слабеет! Ещё один свайп на афишу!';
      setTimeout(() => { if (swipeCount === 1) { tornadoTiltTarget.z = 0; tornadoTiltTarget.x = 0; } }, 750);
    } else if (swipeCount >= 2) {
      if (gem2) { gem2.classList.add('active'); gem2.textContent = '⚡'; }
      if (swipeHintText) swipeHintText.textContent = '🎉 Ураган рассеян! Домик летит на дом Ведьмы!';
      if (window.doFlash) window.doFlash('#00ffa2', 350);

      blowTornadoAndLaunchHouse(dx >= 0 ? 1 : -1);
    }
  }

  // ─── ЗАПУСК ДОМИКА И РАССЕИВАНИЕ УРАГАНА ───────────────
  function blowTornadoAndLaunchHouse(dirX = 1) {
    tornadoBlowAway = true;
    tornadoBlowVel.set(dirX * 6.5, 3.5, -4.5);

    houseState = 'LAUNCHING';
    window.houseState = houseState;
    houseFlight.startTime = performance.now();
    houseFlight.duration = 1400;

    const houseGroup = window.houseGroup;
    const witchCottageGroup = window.witchCottageGroup;
    if (houseGroup) {
      houseFlight.startPos.copy(houseGroup.position);
      houseFlight.startRot.copy(houseGroup.rotation);
    }

    if (witchCottageGroup && dioramaGroup) {
      witchCottageGroup.getWorldPosition(houseFlight.targetPos);
      dioramaGroup.worldToLocal(houseFlight.targetPos);
    } else {
      houseFlight.targetPos.set(0.05, 0.18, -0.18);
    }
  }

  function onHouseLanded() {
    houseState = 'LANDED';
    window.houseState = houseState;
    houseBouncePhase = 0;

    const houseGroup = window.houseGroup;
    const witchLegsGroup = window.witchLegsGroup;
    const starSparklesPoints = window.starSparklesPoints;

    if (houseGroup) {
      houseGroup.position.copy(houseFlight.targetPos);
      houseGroup.rotation.set(0, 0.12, 0);
    }

    if (window.sfx) {
      if (window.sfx.snap) window.sfx.snap();
      if (window.sfx.tada) window.sfx.tada();
    }

    if (window.triggerDustBurst) window.triggerDustBurst(houseFlight.targetPos);

    if (witchLegsGroup) witchLegsGroup.visible = true;
    if (starSparklesPoints) starSparklesPoints.material.opacity = 0.95;

    const hint = document.getElementById('swipe-hint-text');
    if (hint) hint.textContent = '👠 Домик Элли раздавил дом Злой Ведьмы! Буря утихла!';

    // Через 2.5 секунды переходим к Сцене 2
    setTimeout(() => {
      if (window.doFlash) window.doFlash('#00ffa2', 350);
      stopThreeScene1();
      const scene1 = document.getElementById('scene1');
      if (scene1) scene1.style.display = 'none';
      if (window.startScene2) window.startScene2();
    }, 2500);
  }

  function stopThreeScene1() {
    if (tAnimId) {
      cancelAnimationFrame(tAnimId);
      tAnimId = null;
    }
  }

  // ─── ОСНОВНОЙ ЦИКЛ РЕНДЕРИНГА ──────────────────────────
  function threeRenderLoop(time) {
    if (window.S.scene !== 1) return;
    tAnimId = requestAnimationFrame(threeRenderLoop);

    const dt = Math.min(tClock ? tClock.getDelta() : 0.016, 0.05);
    const elapsed = tClock ? tClock.getElapsedTime() : (time * 0.001);

    // Ориентация камеры
    if (tCamera) {
      const cameraActive = window.cameraActive;
      if (!cameraActive) {
        tCamera.rotation.x = THREE.MathUtils.lerp(tCamera.rotation.x, camGyroPitch, dt * 6);
        tCamera.rotation.y = THREE.MathUtils.lerp(tCamera.rotation.y, camGyroYaw, dt * 6);
      } else {
        tCamera.position.set(0, 0, 0);
        tCamera.rotation.set(0, 0, 0);
      }
    }

    // Видимость диорамы
    const posterEncounterTriggered = window.posterEncounterTriggered;
    const opticalTargetDetected = window.opticalTargetDetected;
    if (dioramaGroup) {
      if (posterEncounterTriggered || opticalTargetDetected || houseState === 'LAUNCHING' || houseState === 'LANDED') {
        dioramaGroup.visible = true;
        if (window.posterGroup) window.posterGroup.visible = true;
      }
    }

    const tornadoGroup = window.tornadoGroup;
    const houseGroup = window.houseGroup;
    const floorContactMesh = window.floorContactMesh;
    const vortexParticles = window.vortexParticles;
    const groundSwirlMesh = window.groundSwirlMesh;
    const tornadoRings = window.tornadoRings || [];
    const windRibbons = window.windRibbons || [];
    const debrisList = window.debrisList || [];
    const houseShutters = window.houseShutters || [];
    const witchCottageGroup = window.witchCottageGroup;
    const witchLegsGroup = window.witchLegsGroup;
    const starSparklesPoints = window.starSparklesPoints;
    const dustBurstPuffs = window.dustBurstPuffs || [];

    // 1. Появление и движение урагана
    if (tornadoState === 'WAITING_FOR_POSTER') {
      const aimed = window.checkAimAtPoster ? window.checkAimAtPoster() : false;
      if (aimed) {
        window.aimHoldTime = (window.aimHoldTime || 0) + dt;
        if (window.aimHoldTime >= 0.35 && window.triggerPosterEncounter) {
          window.triggerPosterEncounter();
        }
      } else {
        window.aimHoldTime = Math.max(0, (window.aimHoldTime || 0) - dt);
      }
    } else if (tornadoState === 'ERUPTING') {
      const ep = Math.min(1.0, (time - eruptionStartTime) / ERUPTION_DURATION);
      const ease = 1 - Math.pow(1 - ep, 3);

      if (tornadoGroup) {
        tornadoGroup.position.lerpVectors(window.TORNADO_POSTER_POS, window.TORNADO_ROOM_DEFAULT, ease);
        tornadoGroup.position.y += Math.sin(ep * Math.PI) * 0.16;
        const currentScale = THREE.MathUtils.lerp(0.02, window.TORNADO_BASE_SCALE, ease);
        tornadoGroup.scale.setScalar(currentScale);
        tornadoGroup.rotation.y += dt * 14.0;
      }

      if (ep > 0.35 && houseGroup && !houseGroup.visible) {
        houseGroup.visible = true;
      }

      if (ep >= 1.0) {
        tornadoState = 'ROAMING';
        window.tornadoState = tornadoState;
        if (tornadoGroup) {
          tornadoGroup.position.copy(window.TORNADO_ROOM_DEFAULT);
          tornadoGroup.scale.setScalar(window.TORNADO_BASE_SCALE);
        }

        if (floorContactMesh) {
          floorContactMesh.visible = true;
          floorContactMesh.position.set(tornadoGroup.position.x, window.TORNADO_ROOM_DEFAULT.y + 0.005, tornadoGroup.position.z);
        }

        if (window.triggerObstacleImpact && tornadoGroup) {
          window.triggerObstacleImpact(tornadoGroup.position, new THREE.Vector3(0, 1, 0));
        }
        if (window.sfx && window.sfx.tada) window.sfx.tada();

        const banner = document.getElementById('swipe-hint-text');
        if (banner) banner.textContent = '🌪️ Ураган на столе! Смахните его в сторону афиши!';
      }
    } else if (tornadoState === 'ROAMING' && !tornadoBlowAway && tornadoGroup) {
      tornadoVel.x += Math.sin(elapsed * 1.5) * 0.003;
      tornadoVel.z += Math.cos(elapsed * 1.2) * 0.003;
      tornadoGroup.position.x += tornadoVel.x * dt;
      tornadoGroup.position.z += tornadoVel.z * dt;
      tornadoVel.multiplyScalar(0.92);

      tornadoGroup.position.x = THREE.MathUtils.clamp(tornadoGroup.position.x, -0.32, 0.32);
      tornadoGroup.position.z = THREE.MathUtils.clamp(tornadoGroup.position.z, 0.02, 0.20);
      tornadoGroup.position.y = window.TORNADO_ROOM_DEFAULT.y;

      const isAimed = window.checkAimAtPoster ? window.checkAimAtPoster() : true;
      const banner = document.getElementById('ar-warning-banner');
      if (isAimed && banner && banner.style.display !== 'none') {
        banner.style.display = 'none';
      }
    }

    // Деформация вихря
    let sqCurr = window.tornadoSquashCurrent || 1.0;
    let sqTarg = window.tornadoSquashTarget || 1.0;
    sqCurr = THREE.MathUtils.lerp(sqCurr, sqTarg, dt * 8.0);
    sqTarg = THREE.MathUtils.lerp(sqTarg, 1.0, dt * 4.0);
    window.tornadoSquashCurrent = sqCurr;
    window.tornadoSquashTarget = sqTarg;
    const invSq = 1.0 / Math.sqrt(Math.max(0.4, sqCurr));

    tornadoTiltCurrent.z = THREE.MathUtils.lerp(tornadoTiltCurrent.z, tornadoTiltTarget.z, dt * 6);
    tornadoTiltCurrent.x = THREE.MathUtils.lerp(tornadoTiltCurrent.x, tornadoTiltTarget.x, dt * 6);

    if (tornadoBlowAway && tornadoGroup) {
      tornadoGroup.position.addScaledVector(tornadoBlowVel, dt);
      tornadoOpacity = Math.max(0, tornadoOpacity - dt * 0.75);
      tornadoGroup.scale.multiplyScalar(Math.max(0.01, 1 - dt * 0.8));
      tornadoRings.forEach(r => { r.material.opacity = tornadoOpacity * 0.6; });
      if (groundSwirlMesh) groundSwirlMesh.material.opacity = tornadoOpacity * 0.45;
      if (vortexParticles) vortexParticles.material.opacity = tornadoOpacity * 0.55;
      if (floorContactMesh) floorContactMesh.material.opacity = tornadoOpacity * 0.85;
    } else if (tornadoState === 'ROAMING' && tornadoGroup) {
      tornadoGroup.scale.set(window.TORNADO_BASE_SCALE * invSq, window.TORNADO_BASE_SCALE * sqCurr, window.TORNADO_BASE_SCALE * invSq);
      tornadoGroup.rotation.z = tornadoTiltCurrent.z;
      tornadoGroup.rotation.x = tornadoTiltCurrent.x;
    }

    const spinRate = (4.8 * tornadoSpeedMult) * dt;

    if (floorContactMesh && tornadoGroup) {
      floorContactMesh.position.set(tornadoGroup.position.x, window.TORNADO_ROOM_DEFAULT.y + 0.005, tornadoGroup.position.z);
      floorContactMesh.rotation.y += spinRate * 2.0;
      floorContactMesh.scale.setScalar((tornadoGroup.scale.x / window.TORNADO_BASE_SCALE) * (0.96 + Math.sin(elapsed * 5.0) * 0.05));
      if (!tornadoBlowAway) {
        floorContactMesh.material.opacity = tornadoOpacity * 0.88;
      }
    }

    if (vortexLight && tornadoGroup) {
      vortexLight.position.set(tornadoGroup.position.x, tornadoGroup.position.y + 0.45, tornadoGroup.position.z);
    }

    for (let i = 0; i < tornadoRings.length; i++) {
      const ring = tornadoRings[i];
      ring.rotation.y += spinRate * ring.userData.speedFactor;
      const sway = Math.sin(elapsed * 4.2 + i * 0.45) * 0.06;
      ring.position.x = Math.sin(elapsed * 3.5 + i * 0.3) * sway;
    }

    if (groundSwirlMesh) groundSwirlMesh.rotation.y -= spinRate * 1.5;

    // Частицы вихря
    if (vortexParticles && !tornadoBlowAway && window.vortexParticleData) {
      const posArr = vortexParticles.geometry.attributes.position.array;
      const maxHeight = 2.4;
      for (let i = 0; i < window.vortexParticleData.length; i++) {
        const pd = window.vortexParticleData[i];
        pd.angle += pd.angularSpeed * tornadoSpeedMult * dt;
        pd.h += pd.riseSpeed * tornadoSpeedMult * dt;
        if (pd.isBaseDust && pd.h > 0.20) pd.h = 0.01;
        else if (pd.h > 1.0) pd.h = 0.02;

        const rad = pd.isBaseDust ? pd.radiusSpread : (0.12 + Math.pow(pd.h, 1.4) * 0.72) * 0.85;
        posArr[i * 3]     = Math.cos(pd.angle) * rad;
        posArr[i * 3 + 1] = 0.02 + pd.h * maxHeight;
        posArr[i * 3 + 2] = Math.sin(pd.angle) * rad;
      }
      vortexParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Ветровые ленты и обломки
    windRibbons.forEach(r => { r.rotation.y += r.userData.speed * tornadoSpeedMult * dt; });
    debrisList.forEach(d => {
      d.userData.angle += d.userData.speed * tornadoSpeedMult * dt;
      const r = 0.14 + Math.pow(d.userData.t, 1.35) * 0.72 + d.userData.radiusOffset * 0.15;
      d.position.set(Math.cos(d.userData.angle) * r, 0.06 + d.userData.t * 2.2, Math.sin(d.userData.angle) * r);
      d.rotation.x += d.userData.rotSpeed.x * dt;
      d.rotation.y += d.userData.rotSpeed.y * dt;
    });

    // 2. Анимация Домика Элли
    if (houseState === 'ORBITING' && houseGroup && tornadoGroup) {
      const hAngle = elapsed * 2.2 * tornadoSpeedMult;
      const orbitR = 0.14;
      const bobY = Math.sin(elapsed * 4.2) * 0.015;

      houseGroup.position.set(
        tornadoGroup.position.x + Math.cos(hAngle) * orbitR,
        tornadoGroup.position.y + 0.26 + bobY,
        tornadoGroup.position.z + Math.sin(hAngle) * orbitR
      );

      houseGroup.rotation.y = -hAngle + Math.PI / 4;
      houseGroup.rotation.z = Math.sin(elapsed * 4.8) * 0.22 + 0.14;
      houseGroup.rotation.x = Math.cos(elapsed * 4.2) * 0.18;

      houseShutters.forEach(sh => {
        sh.rotation.y = Math.sin(elapsed * 16 + sh.userData.phase) * 0.45 * sh.userData.side;
      });

    } else if (houseState === 'LAUNCHING' && houseGroup) {
      const p = Math.min(1.0, (time - houseFlight.startTime) / houseFlight.duration);
      const easeOut = 1 - Math.pow(1 - p, 2);

      houseGroup.position.x = THREE.MathUtils.lerp(houseFlight.startPos.x, houseFlight.targetPos.x, easeOut);
      houseGroup.position.z = THREE.MathUtils.lerp(houseFlight.startPos.z, houseFlight.targetPos.z, easeOut);

      const linearY = THREE.MathUtils.lerp(houseFlight.startPos.y, houseFlight.targetPos.y, p * p);
      const arcLift = Math.sin(p * Math.PI) * 0.45;
      houseGroup.position.y = linearY + arcLift;

      houseGroup.rotation.y = houseFlight.startRot.y + p * Math.PI * 2.5;
      houseGroup.rotation.x = THREE.MathUtils.lerp(houseFlight.startRot.x, 0, easeOut);
      houseGroup.rotation.z = THREE.MathUtils.lerp(houseFlight.startRot.z, 0, easeOut);

      if (p >= 1.0) onHouseLanded();

    } else if (houseState === 'LANDED' && houseGroup) {
      if (houseBouncePhase < 1.0) {
        houseBouncePhase += dt * 2.5;
        const b = houseBouncePhase;
        const damping = Math.exp(-4.5 * b);

        const bounceY = Math.abs(Math.sin(b * Math.PI * 3.0)) * 0.32 * damping;
        houseGroup.position.y = houseFlight.targetPos.y + bounceY;

        const squash = Math.sin(b * Math.PI * 6.0) * 0.16 * damping;
        houseGroup.scale.set(1 + squash, 1 - squash, 1 + squash);

        witchSquash = Math.max(0.12, 1.0 - b * 1.6);
        if (witchCottageGroup) witchCottageGroup.scale.set(1.15, witchSquash, 1.15);

        legsSlide = Math.min(1.0, b * 1.8);
        if (witchLegsGroup) {
          witchLegsGroup.position.y = -0.42 - legsSlide * 0.14;
          witchLegsGroup.position.z = 0.18 + legsSlide * 0.22;
        }
      } else {
        houseGroup.position.copy(houseFlight.targetPos);
        houseGroup.scale.setScalar(1.0);
        if (witchCottageGroup) witchCottageGroup.scale.set(1.15, 0.12, 1.15);
      }

      if (starSparklesPoints && starSparklesPoints.material.opacity > 0 && window.starSparkleData) {
        const sPos = starSparklesPoints.geometry.attributes.position.array;
        for (let i = 0; i < window.starSparkleData.length; i++) {
          const sd = window.starSparkleData[i];
          sPos[i * 3 + 1] = sd.basePos.y + Math.sin(elapsed * sd.speed + sd.phase) * 0.15;
        }
        starSparklesPoints.geometry.attributes.position.needsUpdate = true;
      }
    }

    // 3. Обновление клубов пыли
    dustBurstPuffs.forEach(p => {
      if (!p.visible) return;
      p.userData.life += dt;
      const prog = p.userData.life / p.userData.maxLife;
      if (prog >= 1.0) { p.visible = false; return; }
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.y -= 2.6 * dt;
      p.scale.setScalar((1.0 - prog * 0.45) * 1.1);
      p.material.opacity = (1.0 - prog) * 0.85;
    });

    // 4. Неоновый шлейф
    drawSwipeTrail();

    // 5. Рендеринг сцены
    tRenderer.render(tScene, tCamera);
  }

  function drawSwipeTrail() {
    const swipeTrailEl = document.getElementById('swipe-trail');
    if (!swipeCanvasCtx || !swipeTrailEl) return;
    swipeCanvasCtx.clearRect(0, 0, swipeTrailEl.width, swipeTrailEl.height);

    const now = performance.now();
    swipeTrailPoints = swipeTrailPoints.filter(pt => now - pt.time < 220);
    if (swipeTrailPoints.length < 2) return;

    swipeCanvasCtx.save();
    swipeCanvasCtx.lineCap = 'round';
    swipeCanvasCtx.lineJoin = 'round';

    for (let i = 1; i < swipeTrailPoints.length; i++) {
      const p0 = swipeTrailPoints[i - 1];
      const p1 = swipeTrailPoints[i];
      const alpha = i / swipeTrailPoints.length;
      swipeCanvasCtx.beginPath();
      swipeCanvasCtx.moveTo(p0.x, p0.y);
      swipeCanvasCtx.lineTo(p1.x, p1.y);
      swipeCanvasCtx.strokeStyle = `rgba(0, 255, 162, ${alpha * 0.9})`;
      swipeCanvasCtx.lineWidth = alpha * 9;
      swipeCanvasCtx.shadowColor = '#00ffa2';
      swipeCanvasCtx.shadowBlur = 12;
      swipeCanvasCtx.stroke();
    }
    swipeCanvasCtx.restore();
  }

  // Экспорт
  window.initThreeScene1       = initThreeScene1;
  window.onThreeResize         = onThreeResize;
  window.stopThreeScene1       = stopThreeScene1;
  window.initGyroscope         = initGyroscope;
  window.startTornadoEruption  = startTornadoEruption;
  window.handleSwipeGesture    = handleSwipeGesture;

})(window);
