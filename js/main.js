/**
 * Волшебник Изумрудного Города — Главная точка входа, WebRTC камера, QR-код и UI
 */
(function(window) {
  'use strict';

  let cameraActive = false;
  let serverInfo = null;

  window.cameraActive = cameraActive;

  function isSecureConnection() {
    return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  function getHttpsUrl() {
    if (serverInfo && serverInfo.phone_url) return serverInfo.phone_url;
    const host = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? '192.168.0.100' : location.hostname;
    const port = (serverInfo && serverInfo.https_port) ? serverInfo.https_port : 8443;
    return `https://${host}:${port}${location.pathname}${location.search}`;
  }

  function showCamError(html) {
    const camGateError = document.getElementById('camera-gate-error');
    const cameraGate   = document.getElementById('camera-gate');
    if (camGateError) {
      camGateError.innerHTML = html;
      camGateError.style.display = 'block';
    }
    if (cameraGate) cameraGate.style.display = 'flex';
  }

  async function startCamera(options = {}) {
    const silent = !!options.silent;
    const httpsModal = document.getElementById('https-modal');
    const cameraGate = document.getElementById('camera-gate');
    const camGateError = document.getElementById('camera-gate-error');
    const camVideo   = document.getElementById('camera-video');
    const btnCam     = document.getElementById('btn-cam');

    // Проверка HTTPS
    if (!isSecureConnection()) {
      if (!silent && httpsModal) {
        httpsModal.style.display = 'flex';
      }
      return false;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (!silent) {
        showCamError('⚠️ Браузер не поддерживает доступ к камере или заблокировал WebRTC.');
      }
      return false;
    }

    try {
      if (camGateError) camGateError.style.display = 'none';

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (e1) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      if (camVideo) {
        camVideo.srcObject = stream;
        camVideo.setAttribute('playsinline', '');
        camVideo.setAttribute('webkit-playsinline', '');
        camVideo.muted = true;
        await camVideo.play();

        // ОБЯЗАТЕЛЬНО: задаём свойства и атрибуты width/height для MindAR InputLoader!
        const vw = camVideo.videoWidth || 1280;
        const vh = camVideo.videoHeight || 720;
        camVideo.setAttribute('width', vw);
        camVideo.setAttribute('height', vh);
        camVideo.width = vw;
        camVideo.height = vh;
      }

      cameraActive = true;
      window.cameraActive = true;

      if (cameraGate) cameraGate.style.display = 'none';
      if (httpsModal) httpsModal.style.display = 'none';

      if (btnCam) {
        btnCam.style.borderColor = '#00ffa2';
        btnCam.style.boxShadow = '0 0 12px rgba(0,255,162,0.6)';
      }

      // Инициализация трекинга афиши MindAR
      if (window.initOpticalTracking && camVideo) {
        window.initOpticalTracking(camVideo);
      }

      return true;
    } catch (err) {
      console.warn('Camera error:', err);
      cameraActive = false;
      window.cameraActive = false;

      if (!silent) {
        let msg = 'Не удалось включить камеру.<br>';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = '⚠️ Доступ к камере отклонен в браузере.<br>Чтобы включить:<br>1. Нажмите на значок настроек сайта в строке адреса браузера.<br>2. Разрешите доступ к <b>Камере</b>.<br>3. Нажмите кнопку <b>«Разрешить камеру»</b> снова.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg = '⚠️ Камера не обнаружена на этом устройстве.';
        } else {
          msg += (err.message || 'Проверьте разрешения камеры в браузере.');
        }
        showCamError(msg);
      }
      return false;
    }
  }

  function stopCamera() {
    const camVideo = document.getElementById('camera-video');
    const btnCam   = document.getElementById('btn-cam');

    if (camVideo && camVideo.srcObject) {
      camVideo.srcObject.getTracks().forEach(t => t.stop());
      camVideo.srcObject = null;
    }
    cameraActive = false;
    window.cameraActive = false;

    if (btnCam) {
      btnCam.style.borderColor = '';
      btnCam.style.boxShadow = '';
    }
  }

  // ─── QR-КОД И ПОДКЛЮЧЕНИЕ С ТЕЛЕФОНА ───────────────────
  function updatePhoneModalUrl() {
    const modalLink        = document.getElementById('modal-phone-link');
    const modalQr          = document.getElementById('modal-qr-img');
    const modalQrContainer = document.getElementById('modal-qr-container');
    if (!modalLink) return;

    const finalUrl = 'https://k11298379-sudo.github.io/ar/';
    modalLink.textContent = finalUrl;
    modalLink.href = finalUrl;

    if (typeof QRCode !== 'undefined' && modalQrContainer) {
      try {
        modalQrContainer.innerHTML = '';
        new QRCode(modalQrContainer, {
          text: finalUrl,
          width: 160,
          height: 160,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
        return;
      } catch (e) {
        console.warn('Local QRCode fallback to API:', e);
      }
    }

    if (modalQr) {
      modalQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(finalUrl)}`;
    }
  }

  // ─── ПРИВЯЗКА СОБЫТИЙ ИНТЕРФЕЙСА ───────────────────────
  function setupUIBindings() {
    const btnGotoHttps   = document.getElementById('btn-goto-https');
    const httpsModal     = document.getElementById('https-modal');
    const btnRequestCam  = document.getElementById('btn-request-cam');
    const cameraGate     = document.getElementById('camera-gate');
    const btnCam         = document.getElementById('btn-cam');
    const btnSound       = document.getElementById('btn-sound');
    const btnReset       = document.getElementById('btn-reset');
    const btnPoster      = document.getElementById('btn-poster');
    const phoneModal     = document.getElementById('phone-modal');
    const btnPhone       = document.getElementById('btn-phone');
    const btnCloseModal  = document.getElementById('btn-close-modal');
    const btnCopyUrl     = document.getElementById('btn-copy-url');
    const modalLink      = document.getElementById('modal-phone-link');

    if (btnGotoHttps) {
      btnGotoHttps.addEventListener('click', () => { location.href = getHttpsUrl(); });
    }

    if (btnRequestCam) {
      btnRequestCam.addEventListener('click', () => {
        if (window.getCtx) window.getCtx();
        if (window.initGyroscope) window.initGyroscope();
        startCamera({ silent: false });
      });
    }

    if (btnCam) {
      btnCam.addEventListener('click', () => {
        if (window.getCtx) window.getCtx();
        const camVideo = document.getElementById('camera-video');
        if (cameraActive || (camVideo && camVideo.srcObject)) {
          stopCamera();
        } else {
          startCamera({ silent: false });
        }
      });
    }

    if (btnSound) {
      btnSound.addEventListener('click', () => {
        window.S.soundOn = !window.S.soundOn;
        btnSound.textContent = window.S.soundOn ? '🔊' : '🔇';
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => location.reload());
    }

    if (btnPoster) {
      btnPoster.addEventListener('click', () => {
        window.open('poster.html', '_blank');
      });
    }

    if (btnPhone && phoneModal) {
      btnPhone.addEventListener('click', () => { phoneModal.style.display = 'flex'; });
    }

    if (btnCloseModal && phoneModal) {
      btnCloseModal.addEventListener('click', () => { phoneModal.style.display = 'none'; });
    }

    if (phoneModal) {
      phoneModal.addEventListener('click', (e) => {
        if (e.target === phoneModal) phoneModal.style.display = 'none';
      });
    }

    if (btnCopyUrl) {
      btnCopyUrl.addEventListener('click', () => {
        const url = modalLink ? modalLink.href : window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(() => {
            btnCopyUrl.textContent = '✅ Ссылка скопирована!';
            setTimeout(() => { btnCopyUrl.textContent = '📋 Скопировать ссылку'; }, 2000);
          }).catch(() => {
            prompt('Скопируйте ссылку на сайт:', url);
          });
        } else {
          prompt('Скопируйте ссылку на сайт:', url);
        }
      });
    }

    updatePhoneModalUrl();
  }

  // ─── ЗАПУСК ПРИЛОЖЕНИЯ ────────────────────────────────
  async function boot() {
    setupUIBindings();

    try {
      if (window.initThreeScene1) {
        window.initThreeScene1();
      }
    } catch (err) {
      console.error('Three.js Scene 1 init error:', err);
    }

    const httpsModal = document.getElementById('https-modal');
    const cameraGate = document.getElementById('camera-gate');

    if (!isSecureConnection()) {
      if (httpsModal) httpsModal.style.display = 'flex';
    } else {
      const ok = await startCamera({ silent: true });
      if (!ok && cameraGate) {
        cameraGate.style.display = 'flex';
      }
    }
  }

  window.startCamera = startCamera;
  window.stopCamera  = stopCamera;
  window.boot        = boot;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
