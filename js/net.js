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

// Browsers hide a phone's real network address behind a private ".local" name
// unless the camera is in use. Some hotspots can't resolve those names, so when
// camera access is already allowed we open it for a moment while gathering.
async function withAddressBoost(boost, fn) {
  let stream = null;
  if (boost) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch { stream = null; }
  }
  try {
    return await fn();
  } finally {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }
}

// 'direct' = real address shared (connects on most hotspots); 'private' = .local name only.
export function addressKind(sdp) {
  const cands = sdp.split('\r\n').filter((l) => l.startsWith('a=candidate'));
  if (!cands.length) return 'none';
  return cands.some((l) => !/\.local /.test(l)) ? 'direct' : 'private';
}

// Host: make an invite for one player.
export async function createInvite({ boost = false } = {}) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channel = bufferChannel(pc.createDataChannel('table', { ordered: true }));
  await withAddressBoost(boost, async () => {
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc);
  });
  const id = Math.random().toString(36).slice(2, 8);
  const code = await encodeSignal({ i: id, s: slimSdp(pc.localDescription.sdp) });
  return { id, pc, channel, code, link: baseUrl() + '#join=' + code, address: addressKind(pc.localDescription.sdp) };
}

// Host: finish the link once the guest's reply arrives.
export async function acceptReply(invite, reply) {
  await invite.pc.setRemoteDescription({ type: 'answer', sdp: reply.s });
}

// Guest: answer an invite.
export async function answerInvite(offer, { boost = false } = {}) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channelReady = new Promise((resolve) =>
    pc.addEventListener('datachannel', (e) => resolve(bufferChannel(e.channel)))
  );
  await pc.setRemoteDescription({ type: 'offer', sdp: offer.s });
  await withAddressBoost(boost, async () => {
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForIce(pc);
  });
  const code = await encodeSignal({ i: offer.i, s: slimSdp(pc.localDescription.sdp) });
  return { pc, channelReady, code, link: baseUrl() + '#reply=' + code };
}

// Wrap a data channel with JSON send/receive.
export function wrapChannel(channel, onMessage, onClose) {
  const handle = (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return console.warn('Ignored a message that wasn’t JSON');
    }
    try {
      onMessage(msg);
    } catch (err) {
      console.error(err);
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
    close() {
      channel.close();
    },
  };
}

export function whenOpen(channel) {
  return new Promise((resolve) => {
    if (channel.readyState === 'open') return resolve();
    channel.addEventListener('open', () => resolve(), { once: true });
  });
}

// ---------- One-scan joining (needs internet on the hotspot) ----------
// A free public service (PeerJS) introduces the phones; the game itself then
// runs directly between them, the same as the offline method.

import { TURN_CREDENTIALS_URL } from './config.js';

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
let iceServers = STUN;
let turnReady = null;

// Fetch relay (TURN) credentials once per visit. Phones still try a direct
// connection first; the relay is only used when the network blocks that.
function loadTurn() {
  if (turnReady) return turnReady;
  turnReady = (async () => {
    if (!TURN_CREDENTIALS_URL) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(TURN_CREDENTIALS_URL, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      const list = await res.json();
      if (Array.isArray(list) && list.length) {
        iceServers = [...STUN, ...list];
        return true;
      }
    } catch { /* no internet or bad key: direct connections only */ }
    return false;
  })();
  return turnReady;
}

export async function relayAvailable() {
  return loadTurn();
}
// Optional: point at your own PeerJS server, e.g. localStorage 'tg-relay' =
// {"host":"example.com","port":443,"path":"/","secure":true}. Default is PeerJS's free server.
function relayOptions() {
  try {
    return { ...(JSON.parse(localStorage.getItem('tg-relay') || 'null') || {}), config: { iceServers }, debug: 0 };
  } catch {
    return { config: { iceServers }, debug: 0 };
  }
}

function randomId(n = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const r = new Uint32Array(n);
  crypto.getRandomValues(r);
  return Array.from(r, (x) => chars[x % chars.length]).join('');
}

// Wraps a PeerJS connection in the same shape as wrapChannel.
function wrapRelay(dc, onMessage, onClose) {
  dc.on('data', (msg) => {
    try {
      onMessage(msg);
    } catch (err) {
      console.error(err);
    }
  });
  let closed = false;
  const done = () => { if (!closed) { closed = true; onClose && onClose(); } };
  dc.on('close', done);
  dc.on('error', done);
  return {
    send(msg) {
      if (dc.open) dc.send(msg);
    },
    close() {
      dc.close();
    },
  };
}

// Host: open the table. Calls onPlayer({ name, attach }) for each phone that joins;
// call attach(onMessage, onClose) to get a connection. Rejects with no internet.
export async function openOnlineTable(onPlayer, timeoutMs = 8000) {
  await loadTurn();
  return new Promise((resolve, reject) => {
    if (!window.Peer) return reject(new Error('unavailable'));
    const id = 'tablegames-' + randomId();
    const peer = new window.Peer(id, relayOptions());
    let opened = false;
    const timer = setTimeout(() => {
      if (!opened) { peer.destroy(); reject(new Error('timeout')); }
    }, timeoutMs);
    peer.on('open', () => {
      opened = true;
      clearTimeout(timer);
      resolve({ id, link: baseUrl() + '#host=' + id, close: () => peer.destroy() });
    });
    peer.on('connection', (dc) => {
      onPlayer({
        name: String(dc.metadata?.name || 'Player').slice(0, 16),
        attach(onMessage, onClose) {
          const conn = wrapRelay(dc, onMessage, onClose);
          return { conn, opened: new Promise((res) => (dc.open ? res() : dc.on('open', res))) };
        },
      });
    });
    peer.on('disconnected', () => {
      // Lost the introduction service; games in progress keep going. Try to stay joinable.
      setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 3000);
    });
    peer.on('error', (err) => {
      if (!opened) {
        clearTimeout(timer);
        peer.destroy();
        reject(err);
      }
    });
  });
}

// Player: join a host's table by its id.
export async function joinOnlineTable(hostId, name, onMessage, onClose, timeoutMs = 25000) {
  await loadTurn();
  return new Promise((resolve, reject) => {
    if (!window.Peer) return reject(Object.assign(new Error('unavailable'), { type: 'network' }));
    const peer = new window.Peer(relayOptions());
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    };
    const timer = setTimeout(() => fail(Object.assign(new Error('timeout'), { type: 'network' })), timeoutMs);
    peer.on('error', fail);
    peer.on('open', () => {
      const dc = peer.connect(hostId, { reliable: true, serialization: 'json', metadata: { name } });
      dc.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(wrapRelay(dc, onMessage, () => { onClose && onClose(); peer.destroy(); }));
      });
    });
  });
}

export function extractHostId(text) {
  const m = (text || '').match(/#host=(tablegames-[a-z0-9]+)/);
  return m ? m[1] : null;
}
