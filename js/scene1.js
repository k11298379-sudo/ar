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

  // Физика поверхностей (стол, ступени, пол) и гравитационный срыв с края
  let camGyroPitch = 0, camGyroYaw = 0;
  const tornadoSimPos = new THREE.Vector3(0.0, -0.58, 0.42);
  const swipeKickOffset = new THREE.Vector3(0, 0, 0);
  // Позиция урагана на полу комнаты (двигается ТОЛЬКО по свайпам)
  const tornadoRoomTarget  = new THREE.Vector3(0.0, -0.75, -1.45);
  const tornadoRoomCurrent = new THREE.Vector3(0.0, -0.75, -1.45);
  const gyroZeroQuat       = new THREE.Quaternion();
  const currentGyroEuler   = new THREE.Euler(0, 0, 0, 'YXZ');
  const currentGyroQuat    = new THREE.Quaternion();
  const deltaGyroQuat      = new THREE.Quaternion();
  let tornadoFallVelY = 0.0;
  let currentSurfaceName = 'Стол';
  let isTornadoAirborne = false;

  function getRoomSurfaceElevation(lx, lz) {
    return { y: -0.62, tier: 'ROAD', name: 'Дорога' };
  }

  // Гироскоп и пространственная привязка в комнате
  let gyroActive = false;
  let currentGyroAlpha = 0, currentGyroBeta = 0, currentGyroGamma = 0;
  let lastSeenGyroAlpha = 0, lastSeenGyroBeta = 0;
  let currentGyroYaw = 0, currentGyroPitch = 0;
  let lastSeenGyroYaw = 0, lastSeenGyroPitch = 0;
  let hasLockedPosterRoomAnchor = false;
  let lockedTornadoWorldPos = new THREE.Vector3(0, -0.68, -1.20);
  let tmpVec = new THREE.Vector3();

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

    // 3b. Корневая группа урагана в комнате (живет в реальном пространстве комнаты)
    let roomTornadoRoot = new THREE.Group();
    roomTornadoRoot.name = "Room_Tornado_Root";
    roomTornadoRoot.visible = false;
    tScene.add(roomTornadoRoot);
    window.roomTornadoRoot = roomTornadoRoot;

    vortexLight = new THREE.PointLight(0x38bdf8, 1.5, 4.0);
    vortexLight.position.set(0, 0.5, -1.25);
    roomTornadoRoot.add(vortexLight);
    window.vortexLight = vortexLight;

    const fairyLight = new THREE.PointLight(0x84cc16, 1.2, 2.5);
    fairyLight.position.set(0.14, -0.40, -0.85);
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
    if (e.alpha === null || e.beta === null) return;
    gyroActive = true;

    const degToRad = Math.PI / 180;
    const alpha = (e.alpha || 0) * degToRad;
    const beta  = ((e.beta || 90) - 90) * degToRad;
    const gamma = (e.gamma || 0) * degToRad;

    currentGyroEuler.set(-beta, -alpha, gamma, 'YXZ');
    currentGyroQuat.setFromEuler(currentGyroEuler);

    currentGyroYaw = alpha;
    currentGyroPitch = beta;
    window.camGyroPitch = currentGyroPitch;
    window.camGyroYaw   = currentGyroYaw;
  }

  // ─── ВЫРЫВАНИЕ УРАГАНА ИЗ АФИШИ ────────────────────────
  function startTornadoEruption() {
    tornadoState = 'ERUPTING';
    window.tornadoState = tornadoState;
    eruptionStartTime = performance.now();
    tornadoBlowAway = false;
    tornadoOpacity = 1.0;
    swipeCount = 0;

    const roomTornadoRoot = window.roomTornadoRoot;
    if (roomTornadoRoot) roomTornadoRoot.visible = true;

    if (window.tornadoGroup) {
      window.tornadoGroup.position.copy(window.TORNADO_POSTER_POS);
      window.tornadoGroup.scale.setScalar(0.04);
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
    const swipeHint = document.getElementById('swipe-hint');
    const swipeHintText = document.getElementById('swipe-hint-text');
    const gem1 = document.getElementById('gem-1');
    const gem2 = document.getElementById('gem-2');

    if (tornadoState === 'WAITING_FOR_POSTER') {
      if (window.isWebXrActive) {
        tornadoState = 'ROAMING';
        window.tornadoState = tornadoState;
        houseState = 'ORBITING';
        window.houseState = houseState;
      } else {
        if (window.triggerPosterEncounter) window.triggerPosterEncounter();
        return;
      }
    }
    if (tornadoState === 'ERUPTING') {
      tornadoState = 'ROAMING';
      window.tornadoState = tornadoState;
      tornadoSimPos.copy(window.TORNADO_ROOM_DEFAULT);
      if (tornadoGroup) {
        tornadoGroup.scale.setScalar(window.TORNADO_BASE_SCALE);
        tornadoGroup.position.copy(tornadoSimPos);
      }
      if (houseGroup) houseGroup.visible = true;
    }
    if (houseState !== 'ORBITING' || tornadoState !== 'ROAMING') return;

    const nowMs = performance.now();
    const lastSeenTime = window.opticalLastSeenTime || 0;
    const isAimingAtPoster = (window.opticalTargetDetected === true) || (nowMs - lastSeenTime < 600);

    // ────────────────────────────────────────────────────────
    // РЕЖИМ 1: КАМЕРА ОТВЕДЕНА ОТ АФИШИ (ГУЛЯЕМ С УРАГАНОМ ПО КОМНАТЕ)
    // Свайпы толкают ураган по полу комнаты, поворачивают и играют с ним!
    // Игра НЕ заканчивается, домик остаётся кружиться!
    // ────────────────────────────────────────────────────────
    if (!isAimingAtPoster && !window.isWebXrActive) {
      // ══════════════════════════════════════════════════════
      // ДВИЖЕНИЕ УРАГАНА ПРОИСХОДИТ ТОЛЬКО ПО СВАЙПАМ!
      // Сам ураган стоит на месте на полу, пока пользователь не свайпнет!
      // ══════════════════════════════════════════════════════
      const dirX = (dx >= 0 ? 1 : -1);

      // Свайп толкает ураган по полу комнаты
      const stepX = (dx / window.innerWidth) * 1.4;
      const stepZ = -(dy / window.innerHeight) * 1.5;

      tornadoRoomTarget.x = THREE.MathUtils.clamp(tornadoRoomTarget.x + stepX, -2.5, 2.5);
      tornadoRoomTarget.z = THREE.MathUtils.clamp(tornadoRoomTarget.z + stepZ, -4.0, -0.6);

      // Динамический наклон вихря в сторону удара
      tornadoTiltTarget.z = -dirX * 0.85;
      tornadoTiltTarget.x = (dy >= 0 ? 0.40 : -0.40);

      if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();
      if (window.triggerDustBurst && window.tornadoGroup) {
        window.triggerDustBurst(window.tornadoGroup.position);
      }
      if (window.doFlash) window.doFlash('rgba(56, 189, 248, 0.25)', 150);

      if (swipeHint) swipeHint.style.display = 'flex';
      if (swipeHintText) {
        swipeHintText.textContent = '🌪️ Свайпы двигают ураган по полу! Наведите на афишу для удара!';
      }

      setTimeout(() => {
        tornadoTiltTarget.z = 0;
        tornadoTiltTarget.x = 0;
      }, 750);
      return;
    }
    // ────────────────────────────────────────────────────────
    // РЕЖИМ 2: КАМЕРА НАВЕДЕНА НА АФИШУ (АТАКА ДОМА ВЕДЬМЫ)
    // ────────────────────────────────────────────────────────
    swipeCount++;
    const dir = dx >= 0 ? 1 : -1;

    if (swipeCount === 1) {
      if (gem1) { gem1.classList.add('active'); gem1.textContent = '⚡'; }
      tornadoTiltTarget.z = -dir * 0.90;
      tornadoTiltTarget.x = 0.50;
      swipeKickOffset.z = -0.22;
      swipeKickOffset.x = dir * 0.12;
      tornadoSpeedMult = 0.65;

      if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();
      if (window.sfx && window.sfx.snap) window.sfx.snap();
      if (window.doFlash) window.doFlash('rgba(0, 255, 162, 0.45)', 200);

      if (window.triggerDustBurst && window.tornadoGroup) {
        window.triggerDustBurst(window.tornadoGroup.position);
      }

      if (swipeHint) swipeHint.style.display = 'flex';
      if (swipeHintText) swipeHintText.textContent = '⚡ 1-й свайп! Ураган слабеет! Смахните ещё раз в афишу!';

      setTimeout(() => {
        if (swipeCount === 1) {
          tornadoTiltTarget.z = 0;
          tornadoTiltTarget.x = 0;
        }
      }, 900);
    } else if (swipeCount >= 2) {
      if (gem2) { gem2.classList.add('active'); gem2.textContent = '⚡'; }
      if (swipeHintText) swipeHintText.textContent = '🎉 Ураган рассеян! Домик летит на дом Ведьмы!';
      if (window.doFlash) window.doFlash('#00ffa2', 350);

      blowTornadoAndLaunchHouse(dir);
    }
  }

  // Тапы по разным зонам экрана для перемещения по поверхностям (стол, ступени, пол)
  function onSurfaceTapAction(clientX, clientY, yRatio) {
    if (window.S.scene !== 1 || houseState !== 'ORBITING' || tornadoState !== 'ROAMING') return;
    const swipeHintText = document.getElementById('swipe-hint-text');

    tornadoTiltTarget.z = -(clientX / window.innerWidth - 0.5) * 0.45;
    tornadoTiltTarget.x = (yRatio - 0.5) * 0.3;
    window.tornadoSquashTarget = 0.72;
    if (swipeHintText) swipeHintText.textContent = '⚡ Смахните пальцем по экрану, чтобы рассеять ураган!';
    if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();
  }
  window.onSurfaceTapAction = onSurfaceTapAction;

  // ─── ЗАПУСК ДОМИКА И РАССЕИВАНИЕ УРАГАНА ───────────────
  function blowTornadoAndLaunchHouse(dirX = 1) {
    tornadoBlowAway = true;
    tornadoBlowVel.set(dirX * 1.5, 1.2, -3.8);

    houseState = 'LAUNCHING';
    window.houseState = houseState;
    houseFlight.startTime = performance.now();
    houseFlight.duration = 1400;

    const houseGroup = window.houseGroup;
    const dioramaGroup = window.dioramaGroup;
    if (houseGroup && dioramaGroup) {
      if (houseGroup.parent !== dioramaGroup) {
        dioramaGroup.attach(houseGroup);
      }
      houseFlight.startPos.copy(houseGroup.position);
      houseFlight.startRot.copy(houseGroup.rotation);
    }

    houseFlight.targetPos.set(0.14, -0.61, -0.85);
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
      if (dioramaGroup && houseGroup.parent !== dioramaGroup) {
        dioramaGroup.attach(houseGroup);
      }
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
    if (window.S.scene !== 1 || window.isWebXrActive) return;
    tAnimId = requestAnimationFrame(threeRenderLoop);

    const dt = Math.min(tClock ? tClock.getDelta() : 0.016, 0.05);
    const elapsed = tClock ? tClock.getElapsedTime() : (time * 0.001);

    // Ориентация камеры: зафиксирована в центре системы координат AR (если не WebXR)
    if (tCamera && !window.isWebXrActive) {
      tCamera.position.set(0, 0, 0);
      tCamera.rotation.set(0, 0, 0);
    }

    // Видимость диорамы:
    // Диорама (поле, дом ведьмы, портал) видна ТОЛЬКО когда физическая афиша оптически обнаружена MindAR в данный момент!
    const nowMs = performance.now();
    const lastSeenTime = window.opticalLastSeenTime || 0;
    const isTargetActivelyTracked = (window.opticalTargetDetected === true) && (nowMs - lastSeenTime < 500);

    // До первого распознавания афиши диорама скрыта.
    // Как только ураган вырвался, диорама и ураган остаются стабильно видимыми!
    if (dioramaGroup) {
      if (window.isWebXrActive) {
        dioramaGroup.visible = true;
      } else if (isTargetActivelyTracked) {
        lastSeenGyroAlpha = currentGyroAlpha;
        lastSeenGyroBeta  = currentGyroBeta;
        dioramaGroup.visible = true;
      } else {
        if (tornadoState === 'WAITING_FOR_POSTER') {
          dioramaGroup.visible = false;
        } else if (window.lastTrackedPosterMatrix && gyroActive) {
          // Инерциальный SLAM-трекинг по гироскопу:
          // Ураган остаётся стоять в реальной комнате, даже если камера отведена от афиши!
          const dAlpha = (currentGyroAlpha - lastSeenGyroAlpha) * (Math.PI / 180);
          const dBeta  = (currentGyroBeta  - lastSeenGyroBeta)  * (Math.PI / 180);

          const deltaRot = new THREE.Matrix4();
          const eulerRot = new THREE.Euler(-dBeta, -dAlpha, 0, 'YXZ');
          deltaRot.makeRotationFromEuler(eulerRot);

          dioramaGroup.matrix.copy(deltaRot).multiply(window.lastTrackedPosterMatrix);
          dioramaGroup.matrixWorld.copy(dioramaGroup.matrix);
          dioramaGroup.matrixAutoUpdate = false;
          dioramaGroup.matrixWorldNeedsUpdate = true;
          dioramaGroup.visible = true;
        } else {
          dioramaGroup.visible = (tornadoState !== 'WAITING_FOR_POSTER');
        }
      }
      if (window.posterGroup) window.posterGroup.visible = dioramaGroup.visible;
    }

    const roomTornadoRoot = window.roomTornadoRoot;
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

    // Привязка урагана к группе (только если WebXR не активен)
    if (tornadoGroup && !window.isWebXrActive) {
      if (dioramaGroup && tornadoGroup.parent !== dioramaGroup) {
        dioramaGroup.add(tornadoGroup);
      }
      tornadoGroup.visible = (tornadoState !== 'WAITING_FOR_POSTER');
    }

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
    } else if (tornadoState === 'ERUPTING' && !window.isWebXrActive) {
      const ep = Math.min(1.0, (time - eruptionStartTime) / ERUPTION_DURATION);
      const ease = 1 - Math.pow(1 - ep, 3);

      if (tornadoGroup) {
        // Ураган вырывается из глубины афиши наружу на дорогу и стол
        tmpVec.lerpVectors(window.TORNADO_POSTER_POS, window.TORNADO_ROOM_DEFAULT, ease);
        tmpVec.y += Math.sin(ep * Math.PI) * 0.35;
        tornadoGroup.position.copy(tmpVec);
        tornadoGroup.visible = true;

        const currentScale = THREE.MathUtils.lerp(0.08, window.TORNADO_BASE_SCALE, ease);
        tornadoGroup.scale.setScalar(currentScale);
        tornadoGroup.rotation.y += dt * 14.0;

        tornadoGroup.getWorldPosition(lockedTornadoWorldPos);
        lastSeenGyroYaw = currentGyroYaw;
        lastSeenGyroPitch = currentGyroPitch;
        hasLockedPosterRoomAnchor = true;
      }

      if (ep > 0.35 && houseGroup && !houseGroup.visible) {
        houseGroup.visible = true;
      }

      if (ep >= 1.0) {
        tornadoState = 'ROAMING';
        window.tornadoState = tornadoState;
        tornadoSimPos.copy(window.TORNADO_ROOM_DEFAULT);
        tornadoFallVelY = 0.0;
        isTornadoAirborne = false;
        if (tornadoGroup) {
          tornadoGroup.scale.setScalar(window.TORNADO_BASE_SCALE);
          tornadoGroup.position.copy(tornadoSimPos);
          tornadoGroup.visible = true;
        }

        if (floorContactMesh) {
          floorContactMesh.visible = true;
          floorContactMesh.position.set(0, 0.005, 0);
        }

        if (window.triggerObstacleImpact) {
          window.triggerObstacleImpact(lockedTornadoWorldPos, new THREE.Vector3(0, 1, 0));
        }
        if (window.sfx && window.sfx.tada) window.sfx.tada();

        const banner = document.getElementById('swipe-hint-text');
        if (banner) banner.textContent = '🌪️ Ураган перед вами! Смахните его в афишу!';
      }
    } else if (tornadoState === 'ROAMING' && !tornadoBlowAway && tornadoGroup && !window.isWebXrActive) {
      const nowMs = performance.now();
      const lastSeenTime = window.opticalLastSeenTime || 0;
      const isAimingAtPoster = (window.opticalTargetDetected === true) || (nowMs - lastSeenTime < 450);

      const swipeHint = document.getElementById('swipe-hint');
      const hintText = document.getElementById('swipe-hint-text');

      if (isAimingAtPoster) {
        // ── 1. КАМЕРА НАПРАВЛЕНА НА АФИШУ ──
        // Калибруем нулевой угол гироскопа по афише
        gyroZeroQuat.copy(currentGyroQuat);
        tCamera.quaternion.set(0, 0, 0, 1);
        tCamera.position.set(0, 0, 0);

        if (dioramaGroup && tornadoGroup.parent !== dioramaGroup) {
          dioramaGroup.add(tornadoGroup);
        }
        dioramaGroup.visible = true;
        if (posterGroup) posterGroup.visible = true;

        const idleX = Math.sin(elapsed * 2.2) * 0.015;
        const idleZ = Math.cos(elapsed * 1.8) * 0.012;
        swipeKickOffset.lerp(new THREE.Vector3(0, 0, 0), dt * 3.2);

        tornadoSimPos.x = window.TORNADO_ROOM_DEFAULT.x + idleX + swipeKickOffset.x;
        tornadoSimPos.y = window.TORNADO_ROOM_DEFAULT.y;
        tornadoSimPos.z = window.TORNADO_ROOM_DEFAULT.z + idleZ + swipeKickOffset.z;

        tornadoSimPos.x = THREE.MathUtils.clamp(tornadoSimPos.x, -0.35, 0.35);
        tornadoSimPos.y = window.TORNADO_ROOM_DEFAULT.y;
        tornadoSimPos.z = THREE.MathUtils.clamp(tornadoSimPos.z, 0.15, 0.65);

        tornadoGroup.position.copy(tornadoSimPos);
        tornadoGroup.visible = true;

        if (floorContactMesh) {
          floorContactMesh.visible = true;
          floorContactMesh.position.set(0, 0.005, 0);
          floorContactMesh.material.opacity = THREE.MathUtils.lerp(floorContactMesh.material.opacity, 0.88, dt * 10.0);
        }

        if (swipeHint && swipeCount === 0) {
          swipeHint.style.display = 'flex';
          if (hintText && !hintText.textContent) {
            hintText.textContent = '🎯 Афиша найдена! Смахните ураган в афишу, чтобы победить!';
          }
        }
      } else {
        // ── 2. КАМЕРА ОТВЕДЕНА В СТОРОНУ (УРАГАН СТОИТ НА ПОЛУ В КОМНАТЕ) ──
        // Скрываем диораму афиши
        if (dioramaGroup) dioramaGroup.visible = false;
        if (posterGroup) posterGroup.visible = false;

        // Поворачиваем виртуальную камеру Three.js вместе с реальным телефоном!
        if (gyroActive) {
          deltaGyroQuat.copy(gyroZeroQuat).invert().premultiply(currentGyroQuat);
          tCamera.quaternion.copy(deltaGyroQuat);
        }

        // Переносим ураган в мировую сцену комнаты
        const roomTornadoRoot = window.roomTornadoRoot || tScene;
        if (tornadoGroup.parent !== roomTornadoRoot) {
          roomTornadoRoot.add(tornadoGroup);
          roomTornadoRoot.visible = true;
        }

        // Ураган стоит на месте на полу и двигается ТОЛЬКО ПОСЛЕ СВАЙПА!
        tornadoRoomCurrent.lerp(tornadoRoomTarget, dt * 5.0);

        tornadoGroup.position.set(
          tornadoRoomCurrent.x,
          -0.75,
          tornadoRoomCurrent.z
        );
        tornadoGroup.visible = true;

        if (floorContactMesh) {
          floorContactMesh.visible = true;
          floorContactMesh.position.set(0, 0.005, 0);
          floorContactMesh.material.opacity = THREE.MathUtils.lerp(floorContactMesh.material.opacity, 0.88, dt * 10.0);
        }

        if (swipeHint && swipeCount === 0) {
          swipeHint.style.display = 'flex';
          if (hintText) {
            hintText.textContent = '🌪️ Свайпы двигают ураган по полу! Наведите на афишу для удара!';
          }
        }
      }
    }

    // 4. Обновление спецэффектов (вихрь, кольца, пыль, домик)
    updateScene1VFX(dt, elapsed, time);

    // 5. Неоновый шлейф
    drawSwipeTrail();

    // 6. Рендеринг сцены
    tRenderer.render(tScene, tCamera);
  }

  // Общая функция визуальных эффектов (используется и в обычном режиме, и в WebXR ARCore)
  function updateScene1VFX(dt, elapsed, time) {
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
    } else if (tornadoState === 'ROAMING' && tornadoGroup && !window.isWebXrActive) {
      tornadoGroup.scale.set(window.TORNADO_BASE_SCALE * invSq, window.TORNADO_BASE_SCALE * sqCurr, window.TORNADO_BASE_SCALE * invSq);
      tornadoGroup.rotation.z = tornadoTiltCurrent.z;
      tornadoGroup.rotation.x = tornadoTiltCurrent.x;
    } else if (tornadoGroup && window.isWebXrActive) {
      tornadoGroup.scale.set(window.TORNADO_BASE_SCALE * invSq, window.TORNADO_BASE_SCALE * sqCurr, window.TORNADO_BASE_SCALE * invSq);
      tornadoGroup.rotation.z = tornadoTiltCurrent.z;
      tornadoGroup.rotation.x = tornadoTiltCurrent.x;
      tornadoGroup.rotation.y += (4.8 * tornadoSpeedMult) * dt;
    }

    const spinRate = (4.8 * tornadoSpeedMult) * dt;

    if (floorContactMesh && tornadoGroup) {
      floorContactMesh.position.set(0, 0.005, 0);
      floorContactMesh.rotation.y += spinRate * 2.0;
      floorContactMesh.scale.setScalar((tornadoGroup.scale.x / window.TORNADO_BASE_SCALE) * (0.96 + Math.sin(elapsed * 5.0) * 0.05));
      if (!tornadoBlowAway) {
        floorContactMesh.material.opacity = tornadoOpacity * 0.88;
      }
    }

    if (vortexLight && tornadoGroup) {
      vortexLight.position.set(0, 0.85, 0);
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

    // Анимация Домика Элли
    if (houseState === 'ORBITING' && houseGroup && tornadoGroup) {
      const hAngle = elapsed * 2.2 * tornadoSpeedMult;
      const orbitR = 0.65;
      const bobY = Math.sin(elapsed * 4.2) * 0.04;

      houseGroup.position.set(
        Math.cos(hAngle) * orbitR,
        0.82 + bobY,
        Math.sin(hAngle) * orbitR
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
          witchLegsGroup.visible = true;
          witchLegsGroup.position.z = -0.68 + legsSlide * 0.16;
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

    // Обновление клубов пыли
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
  }
  window.updateScene1VFX = updateScene1VFX;

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
  window.threeRenderLoop       = threeRenderLoop;
  window.onThreeResize         = onThreeResize;
  window.stopThreeScene1       = stopThreeScene1;
  window.initGyroscope         = initGyroscope;
  window.startTornadoEruption  = startTornadoEruption;
  window.handleSwipeGesture    = handleSwipeGesture;

})(window);
