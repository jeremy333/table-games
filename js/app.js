// app.js — screens and game flow. The host phone holds the real game;
// other phones send moves to it and get back only what they're allowed to see.
import {
  createInvite, acceptReply, answerInvite, decodeSignal, extractCode, wrapChannel, whenOpen,
} from './net.js';
import { qrSvg, startScanner } from './qr.js';
import { GAMES, getGame } from '../games/index.js';

const root = document.getElementById('app');
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('table-games') : null;

const app = {
  name: localStorage.getItem('tg-name') || '',
  host: null,   // { players: [{name, conn}], invites: Map, gameId, state }
  guest: null,  // { conn, gameId, players, view }
  scanner: null,
  camOK: false, // camera allowed this session (helps phones connect)
};

// ---------- tiny helpers ----------

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

function screen(...kids) {
  stopScanner();
  root.replaceChildren(...kids.filter((k) => k != null));
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(text) {
  let t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast', role: 'status' });
    document.body.append(t);
  }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    prompt('Copy this:', text);
  }
}

async function shareLink(url, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Table Games', text, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  copy(url);
}

function stopScanner() {
  if (app.scanner) app.scanner.stop();
  app.scanner = null;
}

// Camera box + paste box. Calls onCode(text) with whatever was scanned or pasted.
function scanOrPaste(label, onCode) {
  const camBox = h('div', { class: 'camera' });
  const input = h('input', { type: 'text', placeholder: 'Or paste the link or code here', 'aria-label': 'Paste link or code' });
  const scanBtn = h('button', {
    class: 'primary',
    onclick: async () => {
      stopScanner();
      app.scanner = startScanner(camBox);
      try {
        const text = await app.scanner.result;
        app.camOK = true;
        onCode(text);
      } catch (e) {
        if (e && e.message) toast(e.message);
      }
    },
  }, label);
  const useBtn = h('button', { onclick: () => onCode(input.value) }, 'Use pasted code');
  return h('div', { class: 'scan-or-paste' }, scanBtn, camBox, h('div', { class: 'paste-row' }, input, useBtn));
}

function nameField() {
  const input = h('input', {
    type: 'text', maxlength: '16', value: app.name, placeholder: 'Your name', 'aria-label': 'Your name',
    oninput: (e) => {
      app.name = e.target.value.trim();
      localStorage.setItem('tg-name', app.name);
    },
  });
  return h('label', { class: 'field' }, h('span', {}, 'Your name'), input);
}

function needName() {
  if (app.name) return false;
  toast('Enter your name first');
  return true;
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* not supported; fine */ }
}
document.addEventListener('visibilitychange', () => {
  if ((app.host || app.guest) && document.visibilityState === 'visible') keepAwake();
});

// ---------- home ----------

function showHome() {
  screen(
    h('header', { class: 'hero' },
      h('h1', {}, 'Table Games'),
      h('p', {}, 'Card games across everyone’s phones. No internet needed — just the same Wi‑Fi or hotspot.')),
    nameField(),
    h('div', { class: 'stack' },
      h('button', { class: 'primary big', onclick: () => { if (!needName()) startHosting(); } }, 'Host a game'),
      h('button', { class: 'big', onclick: () => { if (!needName()) showJoinScan(); } }, 'Join a game')),
    h('p', { class: 'note' },
      'Before you go offline, everyone should open this page once so their phone saves it.'),
  );
}

function showJoinScan() {
  screen(
    h('button', { class: 'back', onclick: showHome }, '‹ Back'),
    h('h2', {}, 'Join a game'),
    h('p', {}, 'First join the host’s hotspot. Then scan the join code on the host’s phone, or open the link they texted you.'),
    scanOrPaste('Scan host’s code', (text) => {
      const code = extractCode(text, 'join');
      if (!code) return toast('That isn’t a join code.');
      joinWithCode(code);
    }),
  );
}

// ---------- hotspot setup box ----------

function wifiEscape(v) {
  return v.replace(/([\\;,:"])/g, '\\$1');
}

function hotspotBox() {
  const saved = JSON.parse(localStorage.getItem('tg-wifi') || '{}');
  const ssid = h('input', { type: 'text', value: saved.ssid || '', placeholder: 'Hotspot name', 'aria-label': 'Hotspot name', autocomplete: 'off' });
  const pass = h('input', { type: 'text', value: saved.pass || '', placeholder: 'Hotspot password', 'aria-label': 'Hotspot password', autocomplete: 'off' });
  const qr = h('div', { class: 'wifi-qr' });
  const update = () => {
    const name = ssid.value;
    const pw = pass.value;
    localStorage.setItem('tg-wifi', JSON.stringify({ ssid: name, pass: pw }));
    if (!name) {
      qr.replaceChildren();
      return;
    }
    const data = `WIFI:T:${pw ? 'WPA' : 'nopass'};S:${wifiEscape(name)};${pw ? `P:${wifiEscape(pw)};` : ''};`;
    qr.innerHTML = '<div class="qr"></div>';
    qr.firstChild.innerHTML = qrSvg(data);
    qr.append(h('p', { class: 'note' }, 'Others point their camera here and tap the Wi‑Fi prompt to join.'));
  };
  ssid.addEventListener('input', update);
  pass.addEventListener('input', update);
  update();

  return h('details', { class: 'setup-box', open: !saved.ssid },
    h('summary', {}, 'Hotspot setup'),
    h('ol', { class: 'setup-steps' },
      h('li', {}, 'Turn on your hotspot. iPhone: Settings › Personal Hotspot › Allow Others to Join. Android: Settings › Connections › Mobile Hotspot.'),
      h('li', {}, 'Type its name and password below, exactly as your phone shows them. Saved on this phone only.'),
      h('li', {}, 'Others scan the Wi‑Fi code to join your hotspot, then scan your join code below.')),
    h('div', { class: 'wifi-fields' }, ssid, pass),
    qr,
  );
}

// ---------- host ----------

// Ask for the camera up front: it's needed to scan players' codes, and while it's
// allowed, phones share real network addresses, which connect better on hotspots.
async function startHosting() {
  let granted = false;
  try {
    granted = (await navigator.permissions.query({ name: 'camera' })).state === 'granted';
  } catch { /* not supported (e.g. some iPhones) */ }
  if (granted || app.camOK) {
    app.camOK = true;
    return openTable();
  }
  screen(
    h('button', { class: 'back', onclick: showHome }, '‹ Back'),
    h('h2', {}, 'Allow the camera'),
    h('p', {}, 'You’ll scan each player’s code to let them in. Allowing the camera now also helps phones connect on a hotspot.'),
    h('div', { class: 'stack' },
      h('button', {
        class: 'primary big',
        onclick: async () => {
          try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            s.getTracks().forEach((t) => t.stop());
            app.camOK = true;
          } catch {
            toast('Camera not allowed. You can still paste codes.');
          }
          openTable();
        },
      }, 'Allow camera'),
      h('button', { class: 'quiet', onclick: openTable }, 'Skip for now')),
  );
}

function openTable() {
  app.host = {
    players: [{ name: app.name, conn: null }],
    joining: [],          // people connecting, waiting to be let in
    invites: new Map(),   // open join codes by id
    used: new Set(),
    current: null,        // the join code on screen
    making: null,
    gameId: GAMES[0].id,
    state: null,
  };
  keepAwake();
  showLobby();
}

function lobbyMessage() {
  return { t: 'lobby', players: app.host.players.map((p) => p.name), gameId: app.host.gameId };
}

function sendToGuests(makeMsg) {
  app.host.players.forEach((p, seat) => {
    if (seat > 0 && p.conn) p.conn.send(makeMsg(seat));
  });
}

function showLobby() {
  const host = app.host;
  const select = h('select', {
    'aria-label': 'Game',
    onchange: (e) => {
      host.gameId = e.target.value;
      sendToGuests(lobbyMessage);
      updateLobby();
    },
  }, GAMES.map((g) => h('option', { value: g.id, selected: g.id === host.gameId }, g.name)));

  screen(
    h('button', { class: 'back', onclick: () => { if (confirm('Leave and end this game for everyone?')) endHosting(); } }, '‹ End'),
    h('h2', {}, 'Your table'),
    hotspotBox(),
    h('div', { id: 'joining' }),
    h('h3', { class: 'section' }, 'Players'),
    h('ol', { class: 'players', id: 'players' }),
    h('label', { class: 'field' }, h('span', {}, 'Game'), select),
    h('p', { class: 'rules', id: 'rules' }),
    h('button', { class: 'primary big', id: 'start', onclick: startGame }),
    h('section', { class: 'add-box' },
      h('h3', { class: 'section' }, 'Add players'),
      h('p', { class: 'step' }, 'Step 1 — they scan your join code with their camera, or you text them the link, and tap Join.'),
      h('div', { class: 'qr', id: 'invite-qr' }, h('p', { class: 'note' }, 'Making a join code…')),
      h('p', { class: 'note', id: 'invite-note' }),
      h('div', { class: 'row' },
        h('button', { onclick: () => host.current && shareLink(host.current.link, 'Join my card game:') }, 'Text the link'),
        h('button', { onclick: () => host.current && copy(host.current.link) }, 'Copy link')),
      h('p', { class: 'step' }, 'Step 2 — scan the code that appears on their phone (or open the reply link they text back).'),
      scanOrPaste('Scan a player’s code', (text) => {
        const code = extractCode(text, 'reply');
        if (!code) return toast('That isn’t a player’s reply code.');
        handleReply(code);
      })),
  );
  updateLobby();
  renderInvite();
  ensureInvite();
}

const STATUS_TEXT = {
  connecting: 'Code scanned — connecting…',
  connected: 'Connected — getting their name…',
  waiting: 'Wants to join',
  failed: 'Couldn’t connect. Check they’re on your hotspot, then have them scan your join code again.',
};

function updateLobby() {
  const host = app.host;
  const list = document.getElementById('players');
  if (!host || !list) return; // lobby isn't on screen
  const game = getGame(host.gameId);
  document.getElementById('rules').textContent = game.rules;

  list.replaceChildren(...host.players.map((p, i) => h('li', {}, p.name,
    i === 0 ? h('small', {}, ' (you, host)') : null,
    i > 0 && !p.conn ? h('small', { class: 'warn' }, ' disconnected') : null)));

  const box = document.getElementById('joining');
  if (host.joining.length === 0) {
    box.replaceChildren();
  } else {
    const waiting = host.joining.filter((e) => e.status === 'waiting');
    box.replaceChildren(h('section', { class: 'joining-box' },
      h('div', { class: 'joining-head' },
        h('h3', {}, 'Joining'),
        waiting.length > 1 ? h('button', { class: 'primary', onclick: () => waiting.forEach(admit) }, 'Let everyone in') : null),
      h('ul', {}, host.joining.map((e) => h('li', { class: `join-${e.status}` },
        h('div', {},
          h('strong', {}, e.name || 'New player'),
          h('span', { class: 'join-state' }, STATUS_TEXT[e.status])),
        h('div', { class: 'join-actions' },
          e.status === 'waiting' ? h('button', { class: 'primary', onclick: () => admit(e) }, 'Let in') : null,
          e.status === 'waiting' ? h('button', { onclick: () => decline(e) }, 'Decline') : null,
          e.status === 'failed' ? h('button', { onclick: () => dismiss(e) }, 'Dismiss') : null))))));
  }

  const count = host.players.length;
  const canStart = count >= game.minPlayers && count <= game.maxPlayers;
  const start = document.getElementById('start');
  start.disabled = !canStart;
  start.textContent = canStart ? `Start ${game.name}`
    : count < game.minPlayers ? `${game.name} needs ${game.minPlayers}${game.maxPlayers > game.minPlayers ? '–' + game.maxPlayers : ''} players`
      : `${game.name} allows up to ${game.maxPlayers} players`;
}

// Keep one fresh join code ready on the lobby screen.
async function ensureInvite() {
  const host = app.host;
  if (!host || host.making) return;
  if (host.current && host.invites.has(host.current.id)) return renderInvite();
  host.making = (async () => {
    try {
      const inv = await createInvite({ boost: app.camOK });
      host.invites.set(inv.id, inv);
      host.current = inv;
    } catch {
      toast('Couldn’t make a join code on this browser.');
    }
  })();
  await host.making;
  host.making = null;
  if (app.host === host) renderInvite();
}

function renderInvite() {
  const host = app.host;
  const box = document.getElementById('invite-qr');
  if (!host || !box || !host.current) return;
  box.innerHTML = qrSvg(host.current.link);
  const note = document.getElementById('invite-note');
  note.textContent = host.current.address === 'private' && !app.camOK
    ? 'Tip: if players get stuck connecting, tap “Scan a player’s code” once and allow the camera. Join codes made after that connect more reliably on hotspots.'
    : '';
}

async function handleReply(code) {
  const host = app.host;
  if (!host) return false;
  let reply;
  try {
    reply = await decodeSignal(code);
  } catch {
    toast('That code is damaged. Try scanning again.');
    return false;
  }
  const invite = host.invites.get(reply.i);
  if (!invite) {
    toast(host.used.has(reply.i)
      ? 'That join code was already used. Have them scan your new join code and tap Join again.'
      : 'That code doesn’t match your table.');
    return false;
  }
  host.invites.delete(reply.i);
  host.used.add(reply.i);

  const entry = { id: reply.i, name: null, status: 'connecting', conn: null, player: null, pc: invite.pc };
  host.joining.push(entry);
  if (host.current && host.current.id === reply.i) {
    host.current = null;
    ensureInvite(); // next person gets a fresh code
  }
  updateLobby();

  try {
    await acceptReply(invite, reply);
  } catch {
    entry.status = 'failed';
    updateLobby();
    return false;
  }

  const setStatus = (st) => { entry.status = st; updateLobby(); };
  const timer = setTimeout(() => { if (entry.status === 'connecting') setStatus('failed'); }, 20000);
  invite.pc.addEventListener('connectionstatechange', () => {
    if (invite.pc.connectionState === 'failed' && !entry.name) setStatus('failed');
  });
  const opened = () => { if (entry.status === 'connecting' || entry.status === 'failed') setStatus('connected'); };
  if (invite.channel.readyState === 'open') opened();
  else invite.channel.addEventListener('open', opened, { once: true });

  entry.conn = wrapChannel(invite.channel, (msg) => {
    if (msg.t === 'hello' && !entry.name) {
      clearTimeout(timer);
      entry.name = String(msg.name || 'Player').slice(0, 16);
      setStatus('waiting');
      const box = document.getElementById('joining');
      if (!box) toast(`${entry.name} wants to join — let them in from the lobby`);
      else {
        toast(`${entry.name} wants to join`);
        box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      }
    } else if (msg.t === 'move' && entry.player) {
      hostMove(host.players.indexOf(entry.player), msg.move);
    }
  }, () => {
    if (app.host !== host) return;
    if (entry.player) {
      toast(`${entry.player.name} disconnected`);
      if (host.state) {
        entry.player.conn = null; // their seat stays until this round ends
      } else {
        host.players = host.players.filter((p) => p !== entry.player);
        sendToGuests(lobbyMessage);
        updateLobby();
      }
    } else {
      host.joining = host.joining.filter((e) => e !== entry);
      updateLobby();
    }
  });
  return true;
}

function admit(entry) {
  const host = app.host;
  if (!host.joining.includes(entry) || !entry.name) return;
  host.joining = host.joining.filter((e) => e !== entry);
  entry.player = { name: entry.name, conn: entry.conn };
  host.players.push(entry.player);
  entry.conn.send({ t: 'admitted', host: host.players[0].name });
  if (host.state) {
    entry.conn.send(lobbyMessage()); // plays from the next round
  } else {
    sendToGuests(lobbyMessage);
  }
  toast(`${entry.name} joined`);
  updateLobby();
}

function decline(entry) {
  const host = app.host;
  host.joining = host.joining.filter((e) => e !== entry);
  entry.conn?.send({ t: 'declined' });
  setTimeout(() => entry.pc.close(), 500);
  updateLobby();
}

function dismiss(entry) {
  const host = app.host;
  host.joining = host.joining.filter((e) => e !== entry);
  entry.pc.close();
  updateLobby();
}

function startGame() {
  const host = app.host;
  const game = getGame(host.gameId);
  host.players = host.players.filter((p, i) => i === 0 || p.conn);
  if (host.players.length < game.minPlayers || host.players.length > game.maxPlayers) {
    toast(`${game.name} needs ${game.minPlayers}–${game.maxPlayers} players.`);
    return showLobby();
  }
  host.state = game.setup(host.players.map((p) => p.name));
  sendAllViews();
}

function sendView(seat) {
  const host = app.host;
  const game = getGame(host.gameId);
  const p = host.players[seat];
  if (seat >= host.state.names.length) return; // joined mid-game; plays next round
  if (p && p.conn) p.conn.send({ t: 'view', gameId: host.gameId, view: game.viewFor(host.state, seat) });
}

function sendAllViews() {
  app.host.players.forEach((_, seat) => { if (seat > 0) sendView(seat); });
  renderHostTable();
}

function hostMove(seat, move) {
  const host = app.host;
  if (!host.state || seat < 0) return;
  const err = getGame(host.gameId).applyMove(host.state, seat, move);
  if (err) {
    if (seat === 0) toast(err);
    else host.players[seat].conn?.send({ t: 'error', text: err });
    return;
  }
  sendAllViews();
}

function renderHostTable() {
  const host = app.host;
  const game = getGame(host.gameId);
  const view = game.viewFor(host.state, 0);
  const table = h('div', { class: 'table' });
  const waiting = host.joining.filter((e) => e.status === 'waiting').length;
  screen(
    h('div', { class: 'topbar' },
      h('button', {
        class: 'back',
        onclick: () => {
          if (view.winner != null || confirm('Stop this game and go back to the lobby?')) {
            host.state = null;
            sendToGuests(lobbyMessage);
            showLobby();
          }
        },
      }, waiting ? `‹ Lobby (${waiting} waiting)` : '‹ Lobby'),
      h('span', {}, game.name),
      view.winner != null ? h('button', { class: 'primary', onclick: startGame }, 'Play again') : null),
    table,
  );
  game.render(view, table, (move) => hostMove(0, move));
}

function endHosting() {
  const host = app.host;
  host?.players.forEach((p) => p.conn?.channel.close());
  host?.joining.forEach((e) => e.pc.close());
  host?.invites.forEach((inv) => inv.pc.close());
  app.host = null;
  showHome();
}

// Replies opened from a text message arrive in a new tab; pass them to the game tab.
if (bc) {
  bc.addEventListener('message', async (e) => {
    if (e.data?.type === 'reply' && app.host) {
      if (app.host.invites.size === 0) return;
      bc.postMessage({ type: 'ack' });
      await handleReply(e.data.code);
    }
  });
}

function deliverReplyFromLink(code) {
  screen(h('h2', {}, 'Sending reply…'));
  let acked = false;
  if (bc) {
    bc.addEventListener('message', (e) => { if (e.data?.type === 'ack') acked = true; });
    bc.postMessage({ type: 'reply', code });
  }
  setTimeout(() => {
    if (acked) {
      screen(
        h('h2', {}, 'Reply delivered'),
        h('p', {}, 'Switch back to your Table Games tab. You can close this one.'),
      );
    } else {
      screen(
        h('h2', {}, 'Paste this in your game'),
        h('p', {}, 'Copy the reply, go back to your Table Games tab, and paste it under Step 2.'),
        h('button', { class: 'primary big', onclick: () => copy(code) }, 'Copy reply'),
        h('button', { class: 'quiet', onclick: showHome }, 'Go to home screen'),
      );
    }
  }, 1500);
}

// ---------- guest ----------

function joinWithCode(code) {
  screen(
    h('h2', {}, 'Join a game'),
    h('p', { class: 'note' }, 'Make sure you’re on the host’s hotspot or Wi‑Fi first.'),
    nameField(),
    h('button', {
      class: 'primary big',
      onclick: () => { if (!needName()) makeReply(code); },
    }, 'Join'),
  );
}

function guestFailed(text) {
  app.guest = null;
  screen(
    h('h2', {}, 'Couldn’t connect'),
    h('p', {}, text),
    h('button', { class: 'primary big', onclick: showJoinScan }, 'Scan the host’s code again'),
    h('button', { class: 'quiet', onclick: showHome }, 'Home'),
  );
}

async function makeReply(code) {
  screen(h('p', { class: 'status' }, 'Getting ready…'));
  let offer, answer;
  try {
    offer = await decodeSignal(code);
    answer = await answerInvite(offer, { boost: app.camOK });
  } catch {
    return guestFailed('That join code didn’t work. Ask the host to show their current join code, then scan it again.');
  }
  keepAwake();
  const status = h('p', { class: 'status mine', id: 'guest-status' }, 'Waiting for the host to scan your code…');
  screen(
    h('h2', {}, 'Show this to the host'),
    h('p', { class: 'step' }, 'The host taps “Scan a player’s code” and points their camera here. Or text them the link.'),
    h('div', { class: 'qr' }),
    h('div', { class: 'row' },
      h('button', { onclick: () => shareLink(answer.link, 'My reply for the card game:') }, 'Text the link'),
      h('button', { onclick: () => copy(answer.link) }, 'Copy link')),
    status,
  );
  root.querySelector('.qr').innerHTML = qrSvg(answer.link);

  let done = false;
  setTimeout(() => {
    if (!done && answer.pc.connectionState === 'new') {
      status.textContent = 'Still waiting. Have the host scan this code — or if they made a new join code, scan their newest one.';
    }
  }, 45000);
  answer.pc.addEventListener('connectionstatechange', () => {
    const st = answer.pc.connectionState;
    if (done) return;
    if (st === 'connecting') status.textContent = 'Connecting to the host…';
    if (st === 'failed') {
      done = true;
      guestFailed('Your phone and the host’s phone couldn’t reach each other. Make sure you’re both on the same hotspot, then scan the host’s join code again.');
    }
  });

  const channel = await answer.channelReady;
  app.guest = { conn: null, gameId: null, players: [], view: null, admitted: false, pc: answer.pc };
  app.guest.conn = wrapChannel(channel, onHostMessage, () => {
    if (!app.guest) return;
    app.guest = null;
    screen(
      h('h2', {}, 'Disconnected from the host'),
      h('p', {}, 'Scan the host’s join code again to rejoin.'),
      h('button', { class: 'primary big', onclick: showJoinScan }, 'Rejoin'),
      h('button', { class: 'quiet', onclick: showHome }, 'Home'),
    );
  });
  await whenOpen(channel);
  done = true;
  app.guest.conn.send({ t: 'hello', name: app.name });
  screen(
    h('h2', {}, 'Connected'),
    h('p', { class: 'status mine' }, 'Waiting for the host to let you in…'),
  );
}

function onHostMessage(msg) {
  const g = app.guest;
  if (!g) return;
  if (msg.t === 'admitted') {
    g.admitted = true;
    g.host = msg.host;
    showGuestLobby();
  } else if (msg.t === 'declined') {
    app.guest = null;
    screen(
      h('h2', {}, 'Not let in'),
      h('p', {}, 'The host didn’t add you to this table.'),
      h('button', { class: 'big', onclick: showHome }, 'Home'),
    );
  } else if (msg.t === 'lobby') {
    g.players = msg.players;
    g.gameId = msg.gameId;
    g.view = null;
    if (g.admitted) showGuestLobby();
  } else if (msg.t === 'view') {
    g.gameId = msg.gameId;
    g.view = msg.view;
    renderGuestTable();
  } else if (msg.t === 'error') {
    toast(msg.text);
  }
}

function showGuestLobby() {
  const g = app.guest;
  const game = g.gameId ? getGame(g.gameId) : null;
  screen(
    h('h2', {}, 'You’re in'),
    game ? h('p', { class: 'rules' }, h('strong', {}, game.name + '. '), game.rules) : null,
    g.players.length ? h('ol', { class: 'players' }, g.players.map((n) => h('li', {}, n))) : null,
    h('p', { class: 'status' }, `Waiting for ${g.host || 'the host'} to start…`),
  );
}

function renderGuestTable() {
  const g = app.guest;
  const game = getGame(g.gameId);
  if (!game) return toast('This game isn’t on your phone yet. Reload the page while online.');
  const table = h('div', { class: 'table' });
  screen(h('div', { class: 'topbar' }, h('span', {}, game.name)), table);
  game.render(g.view, table, (move) => g.conn.send({ t: 'move', move }));
}

// ---------- start ----------

function route() {
  const hash = location.hash;
  history.replaceState(null, '', location.pathname);
  const join = extractCode(hash, 'join');
  const reply = extractCode(hash, 'reply');
  if (join) return joinWithCode(join);
  if (reply) return deliverReplyFromLink(reply);
  showHome();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

route();
