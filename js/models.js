/**
 * Волшебник Изумрудного Города — Процедурные текстуры и 3D-модели Three.js
 * Создает 3D-диораму портала афиши, поляну с домиком Ведьмы, вихрь урагана, летающий домик Элли и частицы пыли
 */
(function(window) {
  'use strict';

  // Константы позиционирования для MR
  const TORNADO_POSTER_POS   = new THREE.Vector3(0.14, -0.40, -0.85); // зарождается у домика Ведьмы в глубине портала
  const TORNADO_ROOM_DEFAULT = new THREE.Vector3(0.0, -0.42, -1.25); // вырывается вперед в комнату перед зрителем
  const TORNADO_BASE_SCALE   = 0.44; // базовый масштаб вихря (~1.1м высота)

  window.TORNADO_POSTER_POS   = TORNADO_POSTER_POS;
  window.TORNADO_ROOM_DEFAULT = TORNADO_ROOM_DEFAULT;
  window.TORNADO_BASE_SCALE   = TORNADO_BASE_SCALE;

  // Текстуры
  let woodPlankTexture, roofShingleTexture, stoneWallTexture, cloudAlphaTexture,
      posterTexture, witchRoofTexture, stripesTexture, floorAbrasionTexture,
      fairytaleSkyTexture, grassMeadowTexture, yellowBrickTexture;

  // 3D-объекты сцены
  let posterGroup, posterMesh, clearingGroup;
  let witchCottageGroup, witchLegsGroup, starSparklesPoints;
  let tornadoGroup, tornadoRings = [], vortexParticles, vortexParticleData = [];
  let windRibbons = [], debrisList = [], groundSwirlMesh, floorContactMesh;
  let houseGroup, cabin, houseShutters = [];
  let dustBurstPuffs = [];
  let starSparkleData = [];

  // Высоты пола и упругость
  let groundElevationCurrent = -0.78;
  let groundElevationTarget  = -0.78;
  let tornadoSquashCurrent   = 1.0;
  let tornadoSquashTarget    = 1.0;

  // ─── ПРОЦЕДУРНЫЕ CANVAS-ТЕКСТУРЫ ───────────────────────
  function generateAllTextures() {
    // 1. Деревянные доски
    const woodC = document.createElement('canvas');
    woodC.width = 512; woodC.height = 512;
    const wCtx = woodC.getContext('2d');
    wCtx.fillStyle = '#8c5832';
    wCtx.fillRect(0, 0, 512, 512);
    for (let p = 0; p < 8; p++) {
      const y0 = p * 64;
      const shade = (p % 2 === 0 ? 8 : -8);
      wCtx.fillStyle = `rgb(${138 + shade}, ${86 + shade * 0.7}, ${48 + shade * 0.5})`;
      wCtx.fillRect(0, y0, 512, 62);
      for (let i = 0; i < 40; i++) {
        wCtx.strokeStyle = i % 3 === 0 ? 'rgba(62, 34, 15, 0.25)' : 'rgba(185, 128, 78, 0.18)';
        wCtx.lineWidth = 1 + Math.random() * 2;
        wCtx.beginPath();
        const ly = y0 + 3 + Math.random() * 56;
        wCtx.moveTo(0, ly);
        for (let x = 0; x <= 512; x += 32) wCtx.lineTo(x, ly + Math.sin(x * 0.03 + i) * 2.2);
        wCtx.stroke();
      }
      wCtx.fillStyle = '#2d180a';
      wCtx.fillRect(0, y0 + 61, 512, 3);
    }
    woodPlankTexture = new THREE.CanvasTexture(woodC);
    woodPlankTexture.wrapS = woodPlankTexture.wrapT = THREE.RepeatWrapping;

    // 2. Гонтовая черепица крыши
    const roofC = document.createElement('canvas');
    roofC.width = 512; roofC.height = 512;
    const rCtx = roofC.getContext('2d');
    rCtx.fillStyle = '#3b2314';
    rCtx.fillRect(0, 0, 512, 512);
    const rows = 12, cols = 10, rH = 512 / rows, cW = 512 / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cW * 0.5);
      for (let c = -1; c <= cols; c++) {
        const v = Math.floor(Math.random() * 18 - 9);
        rCtx.fillStyle = `rgb(${74 + v}, ${45 + v}, ${32 + v})`;
        rCtx.fillRect(c * cW + off + 1, r * rH + 1, cW - 3, rH - 3);
      }
      rCtx.fillStyle = 'rgba(15, 8, 4, 0.55)';
      rCtx.fillRect(0, (r + 1) * rH - 3, 512, 3);
    }
    roofShingleTexture = new THREE.CanvasTexture(roofC);
    roofShingleTexture.wrapS = roofShingleTexture.wrapT = THREE.RepeatWrapping;

    // 3. Каменная кладка трубы и цоколя
    const stoneC = document.createElement('canvas');
    stoneC.width = 256; stoneC.height = 256;
    const sCtx = stoneC.getContext('2d');
    sCtx.fillStyle = '#475569';
    sCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      const g = 95 + Math.floor(Math.random() * 50);
      sCtx.fillStyle = `rgb(${g}, ${g - 3}, ${g - 8})`;
      const sx = Math.random() * 240, sy = Math.random() * 240;
      sCtx.beginPath();
      if (sCtx.roundRect) sCtx.roundRect(sx, sy, 22 + Math.random() * 20, 14 + Math.random() * 12, 4);
      else sCtx.rect(sx, sy, 22 + Math.random() * 20, 14 + Math.random() * 12);
      sCtx.fill();
      sCtx.strokeStyle = '#1e293b'; sCtx.lineWidth = 2; sCtx.stroke();
    }
    stoneWallTexture = new THREE.CanvasTexture(stoneC);
    stoneWallTexture.wrapS = stoneWallTexture.wrapT = THREE.RepeatWrapping;

    // 4. Текстура мягкого облака для частиц вихря
    const cloudC = document.createElement('canvas');
    cloudC.width = 128; cloudC.height = 128;
    const clCtx = cloudC.getContext('2d');
    const grad = clCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.45, 'rgba(226, 232, 240, 0.65)');
    grad.addColorStop(1, 'rgba(148, 163, 184, 0.0)');
    clCtx.fillStyle = grad;
    clCtx.fillRect(0, 0, 128, 128);
    cloudAlphaTexture = new THREE.CanvasTexture(cloudC);

    // 5. Афиша фильма (резервная отрисовка на холсте)
    const postC = document.createElement('canvas');
    postC.width = 768; postC.height = 512;
    const pCtx = postC.getContext('2d');
    const pGrad = pCtx.createLinearGradient(0, 0, 768, 512);
    pGrad.addColorStop(0, '#022416');
    pGrad.addColorStop(0.5, '#064d2d');
    pGrad.addColorStop(1, '#01190f');
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 768, 512);

    pCtx.strokeStyle = '#ffd53d';
    pCtx.lineWidth = 8;
    pCtx.strokeRect(16, 16, 736, 480);
    pCtx.strokeStyle = 'rgba(255, 213, 61, 0.4)';
    pCtx.lineWidth = 2;
    pCtx.strokeRect(26, 26, 716, 460);

    pCtx.textAlign = 'center';
    pCtx.fillStyle = '#6ee7b7';
    pCtx.font = 'bold 20px -apple-system, sans-serif';
    pCtx.fillText('ФИЛЬМ-СКАЗКА В КИНО • AR ОЖИВШИЙ МИР', 384, 65);

    pCtx.fillStyle = '#ffd53d';
    pCtx.font = '900 38px -apple-system, sans-serif';
    pCtx.shadowColor = '#00ffa2';
    pCtx.shadowBlur = 18;
    pCtx.fillText('ВОЛШЕБНИК ИЗУМРУДНОГО ГОРОДА', 384, 120);
    pCtx.shadowBlur = 0;

    pCtx.fillStyle = '#ffffff';
    pCtx.font = 'bold 22px -apple-system, sans-serif';
    pCtx.fillText('ДОРОГА ИЗ ЖЁЛТОГО КИРПИЧА', 384, 160);

    pCtx.fillStyle = 'rgba(0, 255, 162, 0.22)';
    pCtx.beginPath();
    pCtx.moveTo(280, 380);
    pCtx.lineTo(330, 230); pCtx.lineTo(350, 260); pCtx.lineTo(384, 190);
    pCtx.lineTo(418, 260); pCtx.lineTo(438, 230); pCtx.lineTo(488, 380);
    pCtx.closePath();
    pCtx.fill();

    pCtx.fillStyle = '#a7f3d0';
    pCtx.font = 'bold 18px -apple-system, sans-serif';
    pCtx.fillText('🌪️ Смахните ураган 2 раза, чтобы развеять бурю! 🌪️', 384, 450);

    posterTexture = new THREE.CanvasTexture(postC);

    // 6. Темная черепица для домика Злой Ведьмы
    const wRoofC = document.createElement('canvas');
    wRoofC.width = 256; wRoofC.height = 256;
    const wrCtx = wRoofC.getContext('2d');
    wrCtx.fillStyle = '#26122a';
    wrCtx.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 6; c++) {
        const v = Math.floor(Math.random() * 20 - 10);
        wrCtx.fillStyle = `rgb(${48 + v}, ${20 + v}, ${55 + v})`;
        wrCtx.fillRect(c * 42 + 2, r * 32 + 2, 38, 28);
      }
    }
    witchRoofTexture = new THREE.CanvasTexture(wRoofC);
    witchRoofTexture.wrapS = witchRoofTexture.wrapT = THREE.RepeatWrapping;

    // 7. Полосатая текстура чулок Ведьмы
    const strC = document.createElement('canvas');
    strC.width = 128; strC.height = 128;
    const stCtx = strC.getContext('2d');
    stCtx.fillStyle = '#1e1b4b';
    stCtx.fillRect(0, 0, 128, 128);
    stCtx.fillStyle = '#f8fafc';
    for (let i = 0; i < 8; i += 2) {
      stCtx.fillRect(0, i * 16, 128, 16);
    }
    stripesTexture = new THREE.CanvasTexture(strC);
    stripesTexture.wrapS = stripesTexture.wrapT = THREE.RepeatWrapping;

    // 8. Текстура контакта урагана с полом (MR Floor Abrasion)
    const abrC = document.createElement('canvas');
    abrC.width = 512; abrC.height = 512;
    const aCtx = abrC.getContext('2d');

    const aGrad = aCtx.createRadialGradient(256, 256, 12, 256, 256, 245);
    aGrad.addColorStop(0, 'rgba(18, 12, 8, 0.78)');
    aGrad.addColorStop(0.25, 'rgba(32, 24, 16, 0.58)');
    aGrad.addColorStop(0.55, 'rgba(50, 38, 26, 0.26)');
    aGrad.addColorStop(0.82, 'rgba(70, 56, 40, 0.08)');
    aGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    aCtx.fillStyle = aGrad;
    aCtx.fillRect(0, 0, 512, 512);

    aCtx.lineWidth = 3.2;
    aCtx.strokeStyle = 'rgba(24, 16, 10, 0.42)';
    for (let s = 0; s < 36; s++) {
      const a0 = (s / 36) * Math.PI * 2;
      aCtx.beginPath();
      for (let r = 20; r < 235; r += 6) {
        const a = a0 + (r * 0.024);
        const x = 256 + Math.cos(a) * r;
        const y = 256 + Math.sin(a) * r;
        if (r === 20) aCtx.moveTo(x, y);
        else aCtx.lineTo(x, y);
      }
      aCtx.stroke();
    }

    aCtx.lineWidth = 2.4;
    aCtx.strokeStyle = 'rgba(241, 245, 249, 0.32)';
    for (let s = 0; s < 20; s++) {
      const a0 = (s / 20) * Math.PI * 2 + 0.12;
      aCtx.beginPath();
      for (let r = 45; r < 215; r += 8) {
        const a = a0 + (r * 0.030);
        const x = 256 + Math.cos(a) * r;
        const y = 256 + Math.sin(a) * r;
        if (r === 45) aCtx.moveTo(x, y);
        else aCtx.lineTo(x, y);
      }
      aCtx.stroke();
    }
    floorAbrasionTexture = new THREE.CanvasTexture(abrC);

    // 9. Небо Волшебной страны Оз (градиент, облака, холмы и башни Изумрудного Города)
    const skyC = document.createElement('canvas');
    skyC.width = 1024; skyC.height = 512;
    const skCtx = skyC.getContext('2d');
    const skGrad = skCtx.createLinearGradient(0, 0, 0, 512);
    skGrad.addColorStop(0, '#0284c7');    // лазурный зенит
    skGrad.addColorStop(0.35, '#38bdf8'); // яркая бирюза
    skGrad.addColorStop(0.65, '#bae6fd'); // нежно-голубой
    skGrad.addColorStop(0.85, '#fed7aa'); // персиковое утро
    skGrad.addColorStop(1.0, '#fef08a');  // золотистый горизонт
    skCtx.fillStyle = skGrad;
    skCtx.fillRect(0, 0, 1024, 512);

    // Мягкие сказочные облака
    function drawSkyCloud(cx, cy, r, alpha) {
      skCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      for (let c = 0; c < 7; c++) {
        const ox = (c - 3) * (r * 0.45);
        const oy = Math.sin((c / 6) * Math.PI) * (r * 0.25);
        const rad = r * (0.6 + Math.sin((c / 6) * Math.PI) * 0.4);
        skCtx.beginPath();
        skCtx.arc(cx + ox, cy - oy, rad, 0, Math.PI * 2);
        skCtx.fill();
      }
    }
    drawSkyCloud(200, 130, 48, 0.75);
    drawSkyCloud(460, 90, 64, 0.85);
    drawSkyCloud(760, 150, 52, 0.70);
    drawSkyCloud(940, 105, 42, 0.65);

    // Дальние изумрудные холмы на горизонте
    skCtx.fillStyle = '#065f46';
    skCtx.beginPath();
    skCtx.moveTo(0, 512);
    for (let x = 0; x <= 1024; x += 16) {
      const y = 430 + Math.sin(x * 0.008) * 35 + Math.sin(x * 0.02) * 15;
      skCtx.lineTo(x, y);
    }
    skCtx.lineTo(1024, 512);
    skCtx.closePath();
    skCtx.fill();

    // Силуэты шпилей Изумрудного Города на горизонте
    const cityCenter = 512;
    const spires = [
      { x: -55, w: 14, h: 65 }, { x: -35, w: 18, h: 95 }, { x: -12, w: 24, h: 135 },
      { x: 12, w: 22, h: 115 }, { x: 38, w: 16, h: 85 }, { x: 55, w: 12, h: 55 }
    ];
    spires.forEach(sp => {
      const sx = cityCenter + sp.x;
      const sy = 415 - sp.h;
      skCtx.fillStyle = '#047857';
      skCtx.fillRect(sx, sy, sp.w, sp.h + 50);
      skCtx.beginPath();
      skCtx.moveTo(sx - 3, sy);
      skCtx.lineTo(sx + sp.w / 2, sy - 30);
      skCtx.lineTo(sx + sp.w + 3, sy);
      skCtx.closePath();
      skCtx.fillStyle = '#10b981';
      skCtx.fill();
      // Золотой шпиль
      skCtx.fillStyle = '#fbbf24';
      skCtx.fillRect(sx + sp.w / 2 - 1.5, sy - 42, 3, 14);
    });
    fairytaleSkyTexture = new THREE.CanvasTexture(skyC);

    // 10. Сочная сказочная трава с цветами
    const grassC = document.createElement('canvas');
    grassC.width = 512; grassC.height = 512;
    const gCtx = grassC.getContext('2d');
    gCtx.fillStyle = '#15803d';
    gCtx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2200; i++) {
      const gx = Math.random() * 512, gy = Math.random() * 512;
      gCtx.fillStyle = Math.random() > 0.5 ? '#16a34a' : (Math.random() > 0.5 ? '#22c55e' : '#14532d');
      gCtx.fillRect(gx, gy, 3 + Math.random() * 4, 3 + Math.random() * 4);
    }
    const flColors = ['#ef4444', '#f59e0b', '#fbbf24', '#ffffff', '#38bdf8'];
    for (let f = 0; f < 350; f++) {
      const fx = Math.random() * 512, fy = Math.random() * 512;
      gCtx.fillStyle = flColors[f % flColors.length];
      gCtx.beginPath();
      gCtx.arc(fx, fy, 2.5 + Math.random() * 2, 0, Math.PI * 2);
      gCtx.fill();
    }
    grassMeadowTexture = new THREE.CanvasTexture(grassC);
    grassMeadowTexture.wrapS = grassMeadowTexture.wrapT = THREE.RepeatWrapping;
    grassMeadowTexture.repeat.set(3, 3);

    // 11. Дорога из жёлтого кирпича
    const ybC = document.createElement('canvas');
    ybC.width = 512; ybC.height = 256;
    const ybCtx = ybC.getContext('2d');
    ybCtx.fillStyle = '#854d0e';
    ybCtx.fillRect(0, 0, 512, 256);
    const bRows = 8, bCols = 8, bH = 256 / bRows, bW = 512 / bCols;
    for (let r = 0; r < bRows; r++) {
      const offset = (r % 2) * (bW * 0.5);
      for (let c = -1; c <= bCols; c++) {
        const v = Math.floor(Math.random() * 24 - 12);
        ybCtx.fillStyle = `rgb(${250 + v}, ${204 + v}, ${21 + v})`;
        ybCtx.fillRect(c * bW + offset + 2, r * bH + 2, bW - 4, bH - 4);
        ybCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ybCtx.fillRect(c * bW + offset + 4, r * bH + 4, bW - 8, 4);
      }
    }
    yellowBrickTexture = new THREE.CanvasTexture(ybC);
    yellowBrickTexture.wrapS = yellowBrickTexture.wrapT = THREE.RepeatWrapping;
    yellowBrickTexture.repeat.set(1, 5);

    window.woodPlankTexture = woodPlankTexture;
    window.roofShingleTexture = roofShingleTexture;
    window.stoneWallTexture = stoneWallTexture;
    window.cloudAlphaTexture = cloudAlphaTexture;
    window.posterTexture = posterTexture;
    window.witchRoofTexture = witchRoofTexture;
    window.stripesTexture = stripesTexture;
    window.floorAbrasionTexture = floorAbrasionTexture;
    window.fairytaleSkyTexture = fairytaleSkyTexture;
    window.grassMeadowTexture = grassMeadowTexture;
    window.yellowBrickTexture = yellowBrickTexture;
  }

  // ─── 3D-ДИОРАМА ПОРТАЛА АФИШИ И СКАЗОЧНАЯ ПОЛЯНА ─────────
  function createPosterAndClearing() {
    const dioramaGroup = window.dioramaGroup;
    posterGroup = new THREE.Group();
    posterGroup.name = "AR_PosterTarget";
    posterGroup.position.set(0, 0, 0);
    posterGroup.rotation.set(0, 0, 0);
    posterGroup.visible = false;

    // 1. Внешняя золотая рама афиши (1.02 x 1.48 — точно по размеру афиши MindAR)
    const frameW = 1.02, frameH = 1.48, frameD = 0.04, borderThick = 0.05;
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.88,
      roughness: 0.22
    });

    const hBarGeo = new THREE.BoxGeometry(frameW, borderThick, frameD);
    const topBar = new THREE.Mesh(hBarGeo, goldMat);
    topBar.position.set(0, frameH / 2 - borderThick / 2, frameD / 2);
    posterGroup.add(topBar);

    const btmBar = new THREE.Mesh(hBarGeo, goldMat);
    btmBar.position.set(0, -frameH / 2 + borderThick / 2, frameD / 2);
    posterGroup.add(btmBar);

    const vBarGeo = new THREE.BoxGeometry(borderThick, frameH - borderThick * 2, frameD);
    const leftBar = new THREE.Mesh(vBarGeo, goldMat);
    leftBar.position.set(-frameW / 2 + borderThick / 2, 0, frameD / 2);
    posterGroup.add(leftBar);

    const rightBar = new THREE.Mesh(vBarGeo, goldMat);
    rightBar.position.set(frameW / 2 - borderThick / 2, 0, frameD / 2);
    posterGroup.add(rightBar);

    // 2. Каменный свод портала, врезающийся вглубь стены (от Z=0 до Z=-0.45)
    const archDepth = 0.45;
    const innerW = frameW - borderThick * 2;
    const innerH = frameH - borderThick * 2;
    const portalStoneMat = new THREE.MeshStandardMaterial({
      map: stoneWallTexture,
      roughness: 0.88,
      side: THREE.DoubleSide
    });

    // Левая каменная стена
    const leftWallGeo = new THREE.PlaneGeometry(archDepth, innerH);
    leftWallGeo.rotateY(Math.PI / 2);
    const leftWall = new THREE.Mesh(leftWallGeo, portalStoneMat);
    leftWall.position.set(-innerW / 2, 0, -archDepth / 2);
    posterGroup.add(leftWall);

    // Правая каменная стена
    const rightWallGeo = new THREE.PlaneGeometry(archDepth, innerH);
    rightWallGeo.rotateY(-Math.PI / 2);
    const rightWall = new THREE.Mesh(rightWallGeo, portalStoneMat);
    rightWall.position.set(innerW / 2, 0, -archDepth / 2);
    posterGroup.add(rightWall);

    // Верхний каменный свод
    const topArchGeo = new THREE.PlaneGeometry(innerW, archDepth);
    topArchGeo.rotateX(Math.PI / 2);
    const topArch = new THREE.Mesh(topArchGeo, portalStoneMat);
    topArch.position.set(0, innerH / 2, -archDepth / 2);
    posterGroup.add(topArch);

    // Нижний порог
    const btmSillGeo = new THREE.PlaneGeometry(innerW, archDepth);
    btmSillGeo.rotateX(-Math.PI / 2);
    const btmSill = new THREE.Mesh(btmSillGeo, portalStoneMat);
    btmSill.position.set(0, -innerH / 2, -archDepth / 2);
    posterGroup.add(btmSill);

    // 3. Открытое пространство Волшебной страны Оз (clearingGroup)
    clearingGroup = new THREE.Group();
    clearingGroup.name = "PosterFairytaleMeadow";
    clearingGroup.position.set(0, 0, 0);

    // А) ГОРИЗОНТАЛЬНАЯ ПОЛЯНА (трава на уровне пола, уходит в стену на 2.4 метра!)
    const meadowGroundY = -innerH / 2; // -0.69
    const meadowGeo = new THREE.PlaneGeometry(3.6, 2.6, 8, 8);
    meadowGeo.rotateX(-Math.PI / 2);
    const meadowMat = new THREE.MeshStandardMaterial({
      map: grassMeadowTexture,
      roughness: 0.86,
      side: THREE.FrontSide
    });
    const meadowMesh = new THREE.Mesh(meadowGeo, meadowMat);
    meadowMesh.position.set(0, meadowGroundY, -1.35);
    clearingGroup.add(meadowMesh);

    // Б) ДОРОГА ИЗ ЖЁЛТОГО КИРПИЧА (лежит на траве и вьется от горизонта прямо к порогу!)
    const roadGeo = new THREE.PlaneGeometry(0.36, 2.2);
    roadGeo.rotateX(-Math.PI / 2);
    const roadMat = new THREE.MeshStandardMaterial({
      map: yellowBrickTexture,
      roughness: 0.65
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.position.set(0.04, meadowGroundY + 0.005, -1.2);
    roadMesh.rotation.y = -0.06;
    clearingGroup.add(roadMesh);

    // В) СКАЗОЧНОЕ НЕБО ОЗ (панорамный купол в глубине на Z = -2.3 с градиентом, облаками и Изумрудным Городом)
    const skyGeo = new THREE.CylinderGeometry(2.6, 2.6, 2.8, 28, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
    const skyMat = new THREE.MeshBasicMaterial({
      map: fairytaleSkyTexture,
      side: THREE.BackSide,
      depthWrite: false
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.set(0, 0.45, -0.6);
    clearingGroup.add(skyMesh);

    // Г) 3D-ДЕРЕВЬЯ НА РАЗНОЙ ГЛУБИНЕ (создают мощнейший параллакс глубины в стену)
    function addMeadow3DTree(x, z, scale = 1.0) {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(x, meadowGroundY, z);

      // Ствол
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024 * scale, 0.038 * scale, 0.24 * scale, 6),
        new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 })
      );
      trunk.position.y = 0.12 * scale;
      treeGroup.add(trunk);

      // 3 яруса изумрудной кроны
      const crownColors = [0x14532d, 0x15803d, 0x22c55e];
      [
        { r: 0.18, h: 0.28, y: 0.26 },
        { r: 0.14, h: 0.24, y: 0.40 },
        { r: 0.10, h: 0.20, y: 0.52 }
      ].forEach((tier, tIdx) => {
        const cMesh = new THREE.Mesh(
          new THREE.ConeGeometry(tier.r * scale, tier.h * scale, 7),
          new THREE.MeshStandardMaterial({ color: crownColors[tIdx], roughness: 0.78, flatShading: true })
        );
        cMesh.position.y = tier.y * scale;
        treeGroup.add(cMesh);
      });

      clearingGroup.add(treeGroup);
    }

    // Рассадка деревьев: передний план, средний план, задний план
    addMeadow3DTree(-0.35, -0.40, 0.85); // впереди слева у входа
    addMeadow3DTree(0.38, -0.48, 0.90);  // впереди справа
    addMeadow3DTree(-0.62, -0.92, 1.15); // середина слева
    addMeadow3DTree(0.65, -1.05, 1.20);  // середина справа
    addMeadow3DTree(-0.85, -1.55, 1.45); // дальний план слева
    addMeadow3DTree(0.78, -1.70, 1.40);  // дальний план справа

    // Д) Парящие светлячки / волшебные споры
    const sparkleCount = 45;
    const sparkleGeo = new THREE.BufferGeometry();
    const spPos = new Float32Array(sparkleCount * 3);
    for (let i = 0; i < sparkleCount; i++) {
      spPos[i * 3]     = (Math.random() - 0.5) * 1.8;
      spPos[i * 3 + 1] = meadowGroundY + 0.1 + Math.random() * 0.9;
      spPos[i * 3 + 2] = -0.3 - Math.random() * 1.5;
    }
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    const sparkleMat = new THREE.PointsMaterial({
      color: 0xfef08a,
      size: 0.035,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const sparkleMesh = new THREE.Points(sparkleGeo, sparkleMat);
    clearingGroup.add(sparkleMesh);

    posterGroup.add(clearingGroup);
    if (dioramaGroup) dioramaGroup.add(posterGroup);

    window.posterGroup = posterGroup;
    window.clearingGroup = clearingGroup;
  }

  // ─── ДОМИК ЗЛОЙ ВЕДЬМЫ И СЕРЕБРЯНЫЕ БАШМАЧКИ ─────────
  function createWitchCottage() {
    witchCottageGroup = new THREE.Group();
    witchCottageGroup.name = "WickedWickedCottage";
    // Домик стоит НА ГОРИЗОНТАЛЬНОЙ ТРАВЕ в глубине портала (Y=-0.69, Z=-0.85)!
    witchCottageGroup.position.set(0.14, -0.69, -0.85);

    const witchMatWalls = new THREE.MeshStandardMaterial({ color: 0x3d1a3b, roughness: 0.85 });
    const witchMatRoof  = new THREE.MeshStandardMaterial({ map: witchRoofTexture, roughness: 0.85 });
    const witchMatStone = new THREE.MeshStandardMaterial({ map: stoneWallTexture, roughness: 0.9 });
    const witchGlowMat  = new THREE.MeshStandardMaterial({ color: 0xbef264, emissive: 0x84cc16, emissiveIntensity: 0.95 });

    // Каменный фундамент (на земле)
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.38), witchMatStone);
    foundation.position.set(0, 0.04, 0);
    witchCottageGroup.add(foundation);

    // Стены домика (деревянные, слегка перекошенные)
    const walls = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.34), witchMatWalls);
    walls.position.set(0, 0.24, 0);
    walls.rotation.y = -0.05;
    witchCottageGroup.add(walls);

    // Коническая высокая крыша Злой Ведьмы
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.46, 8), witchMatRoof);
    roof.position.set(0, 0.62, 0);
    witchCottageGroup.add(roof);

    // Каменная труба
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), witchMatStone);
    chimney.position.set(0.12, 0.58, -0.06);
    witchCottageGroup.add(chimney);

    // Светящееся окно ведьмы
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.02), witchGlowMat);
    win.position.set(0, 0.24, 0.175);
    witchCottageGroup.add(win);

    if (clearingGroup) clearingGroup.add(witchCottageGroup);

    // Ножки Ведьмы в полосатых чулках и Серебряные башмачки (лежат перед порогом на траве)
    witchLegsGroup = new THREE.Group();
    witchLegsGroup.name = "WitchStripedLegs";
    witchLegsGroup.position.set(0.14, -0.68, -0.68);

    const legMat = new THREE.MeshStandardMaterial({ map: stripesTexture, roughness: 0.65 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.18 });
    const rubyMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    [-0.07, 0.07].forEach((lx) => {
      const legSub = new THREE.Group();
      legSub.position.set(lx, 0, 0);

      const legGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.18, 12);
      legGeo.rotateX(Math.PI / 2);
      const legMesh = new THREE.Mesh(legGeo, legMat);
      legSub.add(legMesh);

      const shoeGroup = new THREE.Group();
      shoeGroup.position.set(0, 0.01, 0.10);

      const shoeBody = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.08), shoeMat);
      shoeGroup.add(shoeBody);

      const toeTip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.045, 8), shoeMat);
      toeTip.rotation.x = Math.PI / 2;
      toeTip.position.set(0, 0, 0.055);
      shoeGroup.add(toeTip);

      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.015, 0.01), rubyMat);
      buckle.position.set(0, 0.018, 0.02);
      shoeGroup.add(buckle);

      legSub.add(shoeGroup);
      witchLegsGroup.add(legSub);
    });

    witchLegsGroup.visible = false;
    if (clearingGroup) clearingGroup.add(witchLegsGroup);

    window.witchCottageGroup = witchCottageGroup;
    window.witchLegsGroup = witchLegsGroup;
  }

  // ─── 3D-ВИХРЬ УРАГАНА ─────────────────────────────────
  function createTornado() {
    const parentGroup = window.roomTornadoRoot || window.dioramaGroup;
    tornadoGroup = new THREE.Group();
    tornadoGroup.name = "TornadoVortex";
    tornadoGroup.position.copy(TORNADO_POSTER_POS);
    tornadoGroup.scale.setScalar(0.04);
    tornadoGroup.visible = false;
    if (parentGroup) parentGroup.add(tornadoGroup);

    tornadoRings = [];
    const numSlices = 24;
    const maxHeight = 2.4; // Компактная высота вихря (~38 см в MR)

    for (let i = 0; i < numSlices; i++) {
      const t = i / (numSlices - 1);
      // Компактный радиус воронки: от 0.14 у основания до 0.86 на вершине
      const radius = 0.14 + Math.pow(t, 1.4) * 0.72;
      const heightStep = (maxHeight / numSlices) * 1.35;

      const sliceGeo = new THREE.CylinderGeometry(radius * 1.06, radius * 0.94, heightStep, 20, 1, true);
      const posAttr = sliceGeo.attributes.position;
      for (let v = 0; v < posAttr.count; v++) {
        const vx = posAttr.getX(v), vz = posAttr.getZ(v);
        const angle = Math.atan2(vz, vx);
        const n = Math.sin(angle * 3 + i * 0.9) * 0.06 + Math.cos(angle * 5 - i) * 0.04;
        posAttr.setX(v, vx * (1 + n));
        posAttr.setZ(v, vz * (1 + n));
      }
      sliceGeo.computeVertexNormals();

      const hue = 0.56 - (1 - t) * 0.46;
      const sat = 0.22 + (1 - t) * 0.15;
      const light = 0.28 + t * 0.22;
      const sliceColor = new THREE.Color().setHSL(hue, sat, light);

      // Полупрозрачный эфирный материал (не перекрывает экран наглухо)
      const sliceMat = new THREE.MeshStandardMaterial({
        color: sliceColor,
        roughness: 0.88,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: (0.28 - t * 0.08),
        depthWrite: false
      });

      const sliceMesh = new THREE.Mesh(sliceGeo, sliceMat);
      sliceMesh.position.y = 0.02 + t * maxHeight;
      sliceMesh.rotation.y = i * 0.55;
      sliceMesh.userData = {
        t: t,
        speedFactor: (2.2 - t * 0.85) * (i % 2 === 0 ? 1 : 0.92),
        currentX: 0,
        currentZ: 0
      };
      tornadoGroup.add(sliceMesh);
      tornadoRings.push(sliceMesh);
    }

    // Приземный пылевой буран
    const groundSwirlGeo = new THREE.CylinderGeometry(0.55, 0.18, 0.24, 24, 2, true);
    const groundSwirlMat = new THREE.MeshStandardMaterial({
      color: 0x786452,
      roughness: 0.95,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    groundSwirlMesh = new THREE.Mesh(groundSwirlGeo, groundSwirlMat);
    groundSwirlMesh.position.y = 0.12;
    tornadoGroup.add(groundSwirlMesh);

    // Абразивный диск контакта с полом/столом
    const floorContactGeo = new THREE.PlaneGeometry(0.85, 0.85);
    floorContactGeo.rotateX(-Math.PI / 2);
    const floorContactMat = new THREE.MeshBasicMaterial({
      map: floorAbrasionTexture,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    floorContactMesh = new THREE.Mesh(floorContactGeo, floorContactMat);
    floorContactMesh.position.set(tornadoGroup.position.x, TORNADO_ROOM_DEFAULT.y + 0.005, tornadoGroup.position.z);
    floorContactMesh.visible = false;
    if (parentGroup) parentGroup.add(floorContactMesh);

    // 650 аккуратных частиц вихря (размер 0.045 вместо 0.44!)
    const pCount = 650;
    const pGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(pCount * 3);
    const colors = new Float32Array(pCount * 3);
    vortexParticleData = [];
    const tmpColor = new THREE.Color();

    for (let i = 0; i < pCount; i++) {
      const t = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const isBaseDust = i < 180;
      const h = isBaseDust ? Math.random() * 0.12 : t;
      const radiusSpread = isBaseDust
        ? (0.16 + Math.random() * 0.35)
        : (0.12 + Math.pow(h, 1.4) * 0.72) * (0.85 + Math.random() * 0.3);

      vortexParticleData.push({
        h: h,
        isBaseDust: isBaseDust,
        angle: angle,
        angularSpeed: (isBaseDust ? 5.5 : 3.2 + (1 - h) * 3.5) * (0.85 + Math.random() * 0.35),
        riseSpeed: isBaseDust ? 0.25 : 0.22 + Math.random() * 0.25,
        radiusSpread: radiusSpread
      });

      positions[i * 3]     = Math.cos(angle) * radiusSpread;
      positions[i * 3 + 1] = h * maxHeight;
      positions[i * 3 + 2] = Math.sin(angle) * radiusSpread;

      if (isBaseDust || h < 0.22) tmpColor.setHSL(0.08, 0.28, 0.36 + Math.random() * 0.15);
      else tmpColor.setHSL(0.56, 0.18, 0.45 + h * 0.28);

      colors[i * 3]     = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pMat = new THREE.PointsMaterial({
      size: 0.045,
      map: cloudAlphaTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    vortexParticles = new THREE.Points(pGeo, pMat);
    tornadoGroup.add(vortexParticles);

    // Ветровые ленты
    windRibbons = [];
    for (let r = 0; r < 10; r++) {
      const t = (r + 0.5) / 10;
      const radius = 0.18 + Math.pow(t, 1.35) * 0.75;
      const arcGeo = new THREE.TorusGeometry(radius, 0.008, 4, 24, Math.PI * (0.65 + Math.random() * 0.55));
      arcGeo.rotateX(Math.PI / 2);
      const arcMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.22, depthWrite: false });
      const ribbon = new THREE.Mesh(arcGeo, arcMat);
      ribbon.userData = { t: t, speed: 5.5 + Math.random() * 3.5 };
      tornadoGroup.add(ribbon);
      windRibbons.push(ribbon);
    }

    // Летающие обломки (компактные досочки и камешки)
    debrisList = [];
    const plankGeo = new THREE.BoxGeometry(0.07, 0.012, 0.022);
    const rockGeo  = new THREE.DodecahedronGeometry(0.018, 0);
    const plankMat = new THREE.MeshStandardMaterial({ map: woodPlankTexture, roughness: 0.8 });
    const leafMat  = new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.7 });

    for (let i = 0; i < 22; i++) {
      const isPlank = i % 2 === 0;
      const mesh = new THREE.Mesh(isPlank ? plankGeo : rockGeo, isPlank ? plankMat : leafMat);
      mesh.userData = {
        t: Math.random(),
        angle: Math.random() * Math.PI * 2,
        speed: 3.4 + Math.random() * 4.0,
        radiusOffset: 0.08 + Math.random() * 0.25,
        rotSpeed: new THREE.Vector3(3 + Math.random() * 5, 4 + Math.random() * 5, 2 + Math.random() * 4)
      };
      tornadoGroup.add(mesh);
      debrisList.push(mesh);
    }

    window.tornadoGroup = tornadoGroup;
    window.tornadoRings = tornadoRings;
    window.groundSwirlMesh = groundSwirlMesh;
    window.floorContactMesh = floorContactMesh;
    window.vortexParticles = vortexParticles;
    window.vortexParticleData = vortexParticleData;
    window.windRibbons = windRibbons;
    window.debrisList = debrisList;
  }

  // ─── ДОМИК ЭЛЛИ ИЗ КАНЗАСА ─────────────────────────────
  function createHouse() {
    const dioramaGroup = window.dioramaGroup;
    houseGroup = new THREE.Group();
    houseGroup.name = "EllieFlyingHouse";
    houseShutters = [];

    cabin = new THREE.Group();

    const wallWoodMat    = new THREE.MeshStandardMaterial({ map: woodPlankTexture, roughness: 0.82, metalness: 0.05 });
    const darkTimberMat  = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.85 });
    const lightTimberMat = new THREE.MeshStandardMaterial({ color: 0xa16638, roughness: 0.78 });
    const roofMat        = new THREE.MeshStandardMaterial({ map: roofShingleTexture, roughness: 0.85 });
    const stoneMat       = new THREE.MeshStandardMaterial({ map: stoneWallTexture, roughness: 0.9 });
    const shutterMat     = new THREE.MeshStandardMaterial({ color: 0x2f5233, roughness: 0.75 });
    const windowGlowMat  = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xd97706, emissiveIntensity: 0.75, roughness: 0.2 });

    // Фундамент
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.14, 0.88), stoneMat);
    foundation.position.set(0, 0.07, -0.06);
    foundation.castShadow = true;
    cabin.add(foundation);

    // Стены
    const mainWalls = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.68, 0.82), wallWoodMat);
    mainWalls.position.set(0, 0.48, -0.06);
    mainWalls.castShadow = true;
    cabin.add(mainWalls);

    // Угловые стойки
    [[-0.5, 0.48, 0.35], [0.5, 0.48, 0.35], [-0.5, 0.48, -0.47], [0.5, 0.48, -0.47]].forEach(([cx, cy, cz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.72, 8), darkTimberMat);
      post.position.set(cx, cy, cz);
      cabin.add(post);
    });

    // Фронтоны и крыша
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-0.52, 0); gableShape.lineTo(0.52, 0); gableShape.lineTo(0, 0.46); gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.84, bevelEnabled: false });
    const gableMesh = new THREE.Mesh(gableGeo, wallWoodMat);
    gableMesh.position.set(0, 0.82, -0.48);
    cabin.add(gableMesh);

    const roofPivot = new THREE.Group();
    roofPivot.position.set(0, 1.28, -0.06);
    const slopeAngle = Math.atan2(0.46, 0.52);

    const leftSlope = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 1.06), roofMat);
    leftSlope.rotation.z = slopeAngle; leftSlope.position.set(-0.27, -0.20, 0);
    roofPivot.add(leftSlope);

    const rightSlope = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 1.06), roofMat);
    rightSlope.rotation.z = -slopeAngle; rightSlope.position.set(0.27, -0.20, 0);
    roofPivot.add(rightSlope);

    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.12, 8), darkTimberMat);
    ridge.rotation.x = Math.PI / 2; ridge.position.set(0, 0.02, 0);
    roofPivot.add(ridge);
    cabin.add(roofPivot);

    // Печная труба
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.17), stoneMat);
    chimney.position.set(0.32, 1.05, -0.24);
    cabin.add(chimney);

    // Веранда
    const porchDeck = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 0.34), darkTimberMat);
    porchDeck.position.set(0, 0.10, 0.51);
    cabin.add(porchDeck);

    const step = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.12), lightTimberMat);
    step.position.set(0, 0.04, 0.72);
    cabin.add(step);

    [-0.46, -0.17, 0.17, 0.46].forEach(px => {
      const pPost = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.48, 0.04), lightTimberMat);
      pPost.position.set(px, 0.38, 0.64);
      cabin.add(pPost);
    });

    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.035, 0.40), roofMat);
    porchRoof.position.set(0, 0.65, 0.52); porchRoof.rotation.x = 0.24;
    cabin.add(porchRoof);

    // Окна со ставнями
    function addWindow(wx, wy, wz, rotY) {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz); wg.rotation.y = rotY;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), windowGlowMat);
      wg.add(glass);
      const lShutter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.20, 0.025), shutterMat);
      lShutter.position.set(-0.14, 0, 0.02);
      lShutter.userData = { side: -1, phase: Math.random() * 6 };
      wg.add(lShutter);
      houseShutters.push(lShutter);

      const rShutter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.20, 0.025), shutterMat);
      rShutter.position.set(0.14, 0, 0.02);
      rShutter.userData = { side: 1, phase: Math.random() * 6 };
      wg.add(rShutter);
      houseShutters.push(rShutter);

      cabin.add(wg);
    }
    addWindow(-0.31, 0.44, 0.355, 0);
    addWindow(0.31, 0.44, 0.355, 0);
    addWindow(-0.505, 0.48, -0.06, -Math.PI / 2);
    addWindow(0.505, 0.48, -0.06, Math.PI / 2);

    cabin.position.y = -0.05;
    cabin.scale.setScalar(0.18);
    houseGroup.add(cabin);
    houseGroup.visible = false;
    const parentGroup = window.roomTornadoRoot || window.dioramaGroup;
    if (parentGroup) parentGroup.add(houseGroup);

    window.houseGroup = houseGroup;
    window.cabin = cabin;
    window.houseShutters = houseShutters;
  }

  // ─── СИСТЕМА ОБЛАКОВ ПЫЛИ И ИСКР ───────────────────────
  function createDustBurstSystem() {
    const dioramaGroup = window.dioramaGroup;
    dustBurstPuffs = [];
    const geo = new THREE.DodecahedronGeometry(0.05, 1);
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9, transparent: true, opacity: 0 });
      const puff = new THREE.Mesh(geo, mat);
      puff.visible = false;
      puff.userData = { vel: new THREE.Vector3(), life: 0, maxLife: 0.75 };
      if (dioramaGroup) dioramaGroup.add(puff);
      dustBurstPuffs.push(puff);
    }
    window.dustBurstPuffs = dustBurstPuffs;
  }

  function triggerDustBurst(pos) {
    dustBurstPuffs.forEach((p, idx) => {
      const angle = (idx / dustBurstPuffs.length) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 1.4 + Math.random() * 1.8;
      p.position.copy(pos).add(new THREE.Vector3(0, -0.04, 0));
      p.userData.vel.set(Math.cos(angle) * spd * 0.6, 0.4 + Math.random() * 0.6, Math.sin(angle) * spd * 0.6);
      p.userData.life = 0.001;
      p.userData.maxLife = 0.65 + Math.random() * 0.3;
      p.scale.setScalar(0.25 + Math.random() * 0.25);
      p.material.opacity = 0.88;
      p.visible = true;
    });
  }

  function createStarSparkles() {
    const count = 36;
    const sGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    starSparkleData = [];

    const c1 = new THREE.Color(0xffd700);
    const c2 = new THREE.Color(0xffffff);

    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 0.6;
      pos[i * 3 + 1] = -0.42 + (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 2] = 0.22 + (Math.random() - 0.5) * 0.3;

      const c = (i % 2 === 0) ? c1 : c2;
      col[i * 3]     = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;

      starSparkleData.push({
        basePos: new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]),
        speed: 2 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2
      });
    }

    sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const sMat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    starSparklesPoints = new THREE.Points(sGeo, sMat);
    if (clearingGroup) clearingGroup.add(starSparklesPoints);

    window.starSparklesPoints = starSparklesPoints;
    window.starSparkleData = starSparkleData;
  }

  // ─── ФИЗИКА СТОЛКНОВЕНИЯ С ПОВЕРХНОСТЬЮ (MR) ───────────
  function triggerObstacleImpact(impactPos, normalVec = null) {
    if (window.sfx && window.sfx.snap) window.sfx.snap();
    window.tornadoSquashTarget = 0.68;
    const nx = normalVec ? normalVec.x : (Math.random() - 0.5);
    const nz = normalVec ? normalVec.z : (Math.random() - 0.5);

    for (let idx = 0; idx < Math.min(10, dustBurstPuffs.length); idx++) {
      const p = dustBurstPuffs[idx];
      const spread = (Math.random() - 0.5) * 0.7;
      p.position.copy(impactPos).add(new THREE.Vector3(nx * 0.1, 0.1 + spread * 0.25, nz * 0.1));
      p.userData.vel.set(
        (nx * 0.9) + (Math.random() - 0.5) * 0.45,
        0.3 + Math.random() * 0.4,
        (nz * 0.9) + (Math.random() - 0.5) * 0.45
      );
      p.userData.life = 0.001;
      p.userData.maxLife = 0.5 + Math.random() * 0.25;
      p.scale.setScalar(0.18 + Math.random() * 0.15);
      p.material.opacity = 0.85;
      p.visible = true;
    }
  }

  function setObstacleElevation(targetY) {
    window.groundElevationTarget = THREE.MathUtils.clamp(targetY, 0.0, 1.1);
  }

  function handleSurfaceTap(clientX, clientY) {
    if (window.houseState !== 'ORBITING') return;
    const yRatio = clientY / window.innerHeight;

    if (yRatio > 0.65) {
      setObstacleElevation(0.0);
    } else if (yRatio >= 0.38) {
      setObstacleElevation(0.42);
    } else {
      setObstacleElevation(0.75);
    }

    const ndcX = (clientX / window.innerWidth) * 2 - 1;
    if (window.tornadoVel) window.tornadoVel.x += ndcX * 2.8;
    window.tornadoSquashTarget = 0.82;
    if (window.sfx && window.sfx.whoosh) window.sfx.whoosh();
  }

  // Экспорт функций
  window.generateAllTextures    = generateAllTextures;
  window.createPosterAndClearing = createPosterAndClearing;
  window.createWitchCottage     = createWitchCottage;
  window.createTornado          = createTornado;
  window.createHouse            = createHouse;
  window.createDustBurstSystem  = createDustBurstSystem;
  window.triggerDustBurst       = triggerDustBurst;
  window.createStarSparkles     = createStarSparkles;
  window.triggerObstacleImpact  = triggerObstacleImpact;
  window.setObstacleElevation   = setObstacleElevation;
  window.handleSurfaceTap       = handleSurfaceTap;

})(window);
