// net.js — connects phones directly (WebRTC) with no internet and no server.
// Handshake: host makes an invite code -> guest makes a reply code -> host reads reply.
// Codes travel by QR code or by a texted link.

// No STUN/TURN servers: phones must share a Wi-Fi network or hotspot.
const RTC_CONFIG = { iceServers: [] };

export function baseUrl() {
  return location.origin + location.pathname;
}

// ---------- Encoding (compress so the QR codes stay small) ----------

function toB64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
}

export async function encodeSignal(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if ('CompressionStream' in window) {
    const out = await pipe(bytes, new CompressionStream('deflate-raw'));
    return 'z' + toB64url(new Uint8Array(out));
  }
  return 'p' + toB64url(bytes);
}

export async function decodeSignal(code) {
  const bytes = fromB64url(code.slice(1));
  let text;
  if (code[0] === 'z') {
    const out = await pipe(bytes, new DecompressionStream('deflate-raw'));
    text = new TextDecoder().decode(out);
  } else {
    text = new TextDecoder().decode(bytes);
  }
  return JSON.parse(text);
}

// Pull a code out of a scanned QR, a pasted link, or a pasted raw code.
export function extractCode(text, kind) {
  if (!text) return null;
  text = text.trim();
  const m = text.match(new RegExp('#' + kind + '=([A-Za-z0-9_-]+)'));
  if (m) return m[1];
  if (/^[zp][A-Za-z0-9_-]{20,}$/.test(text)) return text;
  return null;
}

// ---------- WebRTC helpers ----------

// Drop TCP candidates to keep codes short; phones connect over UDP.
function slimSdp(sdp) {
  return sdp
    .split('\r\n')
    .filter((l) => !(l.startsWith('a=candidate') && / tcp /i.test(l)))
    .join('\r\n');
}

function waitForIce(pc, ms = 3000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const timer = setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

// Hold early messages until the app attaches its handler (the link can open fast).
function bufferChannel(channel) {
  const queue = [];
  const fn = (e) => queue.push(e.data);
  channel.addEventListener('message', fn);
  channel._tgBuffer = { queue, fn };
  return channel;
}

// Host: make an invite for one player.
export async function createInvite() {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channel = bufferChannel(pc.createDataChannel('table', { ordered: true }));
  await pc.setLocalDescription(await pc.createOffer());
  await waitForIce(pc);
  const id = Math.random().toString(36).slice(2, 8);
  const code = await encodeSignal({ i: id, s: slimSdp(pc.localDescription.sdp) });
  return { id, pc, channel, code, link: baseUrl() + '#join=' + code };
}

// Host: finish the link once the guest's reply arrives.
export async function acceptReply(invite, reply) {
  await invite.pc.setRemoteDescription({ type: 'answer', sdp: reply.s });
}

// Guest: answer an invite.
export async function answerInvite(offer) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channelReady = new Promise((resolve) =>
    pc.addEventListener('datachannel', (e) => resolve(bufferChannel(e.channel)))
  );
  await pc.setRemoteDescription({ type: 'offer', sdp: offer.s });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForIce(pc);
  const code = await encodeSignal({ i: offer.i, s: slimSdp(pc.localDescription.sdp) });
  return { pc, channelReady, code, link: baseUrl() + '#reply=' + code };
}

// Wrap a data channel with JSON send/receive.
export function wrapChannel(channel, onMessage, onClose) {
  const handle = (data) => {
    try {
      onMessage(JSON.parse(data));
    } catch (err) {
      console.warn('Bad message', err);
    }
  };
  channel.addEventListener('message', (e) => handle(e.data));
  if (channel._tgBuffer) {
    channel.removeEventListener('message', channel._tgBuffer.fn);
    const early = channel._tgBuffer.queue;
    delete channel._tgBuffer;
    queueMicrotask(() => early.forEach(handle));
  }
  channel.addEventListener('close', () => onClose && onClose());
  return {
    send(msg) {
      if (channel.readyState === 'open') channel.send(JSON.stringify(msg));
    },
    channel,
  };
}

export function whenOpen(channel) {
  return new Promise((resolve) => {
    if (channel.readyState === 'open') return resolve();
    channel.addEventListener('open', () => resolve(), { once: true });
  });
}
