// qr.js — draw QR codes and scan them with the camera. Works offline.
import qrcode from '../vendor/qrcode.mjs';

export function qrSvg(text) {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}

// Opens the camera inside `container` and resolves with the first QR text found.
// Returns { result: Promise<string>, stop() }.
export function startScanner(container) {
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  container.replaceChildren(video);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null;
  let stopped = false;

  function stop() {
    stopped = true;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    container.replaceChildren();
  }

  const result = new Promise(async (resolve, reject) => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (err) {
      stop();
      return reject(new Error('Camera unavailable. Allow camera access, or paste the code instead.'));
    }
    video.srcObject = stream;
    await video.play().catch(() => {});

    const tick = () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = window.jsQR(img.data, canvas.width, canvas.height, {
          inversionAttempts: 'dontInvert',
        });
        if (found && found.data) {
          stop();
          return resolve(found.data);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  return { result, stop };
}
