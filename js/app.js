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
        onCode(await app.scanner.result);
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
    h('p', {}, 'Scan the code on the host’s phone, or open the link they texted you.'),
    scanOrPaste('Scan host’s code', (text) => {
      const code = extractCode(text, 'join');
      if (!code) return toast('That isn’t an invite code.');
      joinWithCode(code);
    }),
  );
}

// ---------- host ----------

function startHosting() {
  app.host = { players: [{ name: app.name, conn: null }], invites: new Map(), gameId: GAMES[0].id, state: null };
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
  const game = getGame(host.gameId);
  const count = host.players.length;
  const canStart = count >= game.minPlayers && count <= game.maxPlayers;

  const select = h('select', {
    'aria-label': 'Game',
    onchange: (e) => {
      host.gameId = e.target.value;
      sendToGuests(lobbyMessage);
      showLobby();
    },
  }, GAMES.map((g) => h('option', { value: g.id, selected: g.id === host.gameId }, g.name)));

  screen(
    h('button', { class: 'back', onclick: () => { if (confirm('Leave and end this game for everyone?')) endHosting(); } }, '‹ End'),
    h('h2', {}, 'Your table'),
    h('label', { class: 'field' }, h('span', {}, 'Game'), select),
    h('p', { class: 'rules' }, game.rules),
    h('ol', { class: 'players' },
      host.players.map((p, i) => h('li', {}, p.name, i === 0 ? h('small', {}, ' (you, host)') : null,
        i > 0 && !p.conn ? h('small', { class: 'warn' }, ' disconnected') : null))),
    h('div', { class: 'stack' },
      h('button', { class: 'big', onclick: showInvite, disabled: count >= game.maxPlayers }, 'Invite a player'),
      h('button', { class: 'primary big', onclick: startGame, disabled: !canStart },
        canStart ? `Start ${game.name}` : `Needs ${game.minPlayers}–${game.maxPlayers} players`)),
  );
}

async function showInvite() {
  screen(h('p', { class: 'status' }, 'Making an invite…'));
  let invite;
  try {
    invite = await createInvite();
  } catch (e) {
    toast('Couldn’t make an invite on this browser.');
    return showLobby();
  }
  app.host.invites.set(invite.id, invite);

  screen(
    h('button', { class: 'back', onclick: showLobby }, '‹ Lobby'),
    h('h2', {}, 'Invite a player'),
    h('p', { class: 'step' }, 'Step 1 — they scan this with their camera, or you text them the link.'),
    h('div', { class: 'qr' }),
    h('div', { class: 'row' },
      h('button', { onclick: () => shareLink(invite.link, 'Join my card game:') }, 'Text the link'),
      h('button', { onclick: () => copy(invite.link) }, 'Copy link')),
    h('p', { class: 'step' }, 'Step 2 — scan the reply code on their phone, or open the reply link they text back.'),
    scanOrPaste('Scan their reply', (text) => {
      const code = extractCode(text, 'reply');
      if (!code) return toast('That isn’t a reply code.');
      handleReply(code);
    }),
  );
  root.querySelector('.qr').innerHTML = qrSvg(invite.link);
}

async function handleReply(code) {
  const host = app.host;
  if (!host) return false;
  let reply;
  try {
    reply = await decodeSignal(code);
  } catch {
    toast('That reply code is damaged. Try again.');
    return false;
  }
  const invite = host.invites.get(reply.i);
  if (!invite) {
    toast('That reply doesn’t match an open invite.');
    return false;
  }
  host.invites.delete(reply.i);
  try {
    await acceptReply(invite, reply);
  } catch {
    toast('Couldn’t use that reply. Make a new invite.');
    return false;
  }
  toast('Connecting…');
  showLobby();

  const timeout = setTimeout(() => {
    if (invite.channel.readyState !== 'open') {
      toast('Couldn’t connect. Check both phones are on the same Wi‑Fi or hotspot.');
    }
  }, 15000);

  let player = null;
  const conn = wrapChannel(invite.channel, (msg) => {
    if (msg.t === 'hello' && !player) {
      clearTimeout(timeout);
      player = { name: String(msg.name || 'Player').slice(0, 16), conn };
      host.players.push(player);
      toast(`${player.name} joined`);
      if (host.state) {
        conn.send(lobbyMessage()); // joins next round
      } else {
        sendToGuests(lobbyMessage);
        showLobby();
      }
    } else if (msg.t === 'move' && player) {
      hostMove(host.players.indexOf(player), msg.move);
    }
  }, () => {
    if (!player || app.host !== host) return;
    toast(`${player.name} disconnected`);
    if (host.state) {
      player.conn = null; // their seat stays until this round ends
    } else {
      host.players = host.players.filter((p) => p !== player);
      sendToGuests(lobbyMessage);
      showLobby();
    }
  });
  return true;
}

function startGame() {
  const host = app.host;
  const game = getGame(host.gameId);
  host.players = host.players.filter((p, i) => i === 0 || p.conn);
  if (host.players.length < game.minPlayers) {
    toast(`${game.name} needs at least ${game.minPlayers} players.`);
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
  if (!host.state) return;
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
      }, '‹ Lobby'),
      h('span', {}, game.name),
      view.winner != null ? h('button', { class: 'primary', onclick: startGame }, 'Play again') : null),
    table,
  );
  game.render(view, table, (move) => hostMove(0, move));
}

function endHosting() {
  app.host?.players.forEach((p) => p.conn?.channel.close());
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
    nameField(),
    h('button', {
      class: 'primary big',
      onclick: () => { if (!needName()) makeReply(code); },
    }, 'Join'),
  );
}

async function makeReply(code) {
  screen(h('p', { class: 'status' }, 'Getting ready…'));
  let offer, answer;
  try {
    offer = await decodeSignal(code);
    answer = await answerInvite(offer);
  } catch {
    screen(
      h('h2', {}, 'That invite didn’t work'),
      h('p', {}, 'Ask the host to make a new invite, then scan it again.'),
      h('button', { class: 'big', onclick: showHome }, 'Home'),
    );
    return;
  }
  keepAwake();
  screen(
    h('h2', {}, 'Send your reply to the host'),
    h('p', { class: 'step' }, 'Let the host scan this code, or text the link back to them.'),
    h('div', { class: 'qr' }),
    h('div', { class: 'row' },
      h('button', { onclick: () => shareLink(answer.link, 'My reply for the card game:') }, 'Text the link'),
      h('button', { onclick: () => copy(answer.link) }, 'Copy link')),
    h('p', { class: 'status' }, 'Waiting for the host…'),
  );
  root.querySelector('.qr').innerHTML = qrSvg(answer.link);

  const channel = await answer.channelReady;
  app.guest = { conn: null, gameId: null, players: [], view: null };
  app.guest.conn = wrapChannel(channel, onHostMessage, () => {
    app.guest = null;
    screen(
      h('h2', {}, 'Disconnected from the host'),
      h('p', {}, 'Ask the host for a new invite to rejoin.'),
      h('button', { class: 'big', onclick: showHome }, 'Home'),
    );
  });
  await whenOpen(channel);
  app.guest.conn.send({ t: 'hello', name: app.name });
  showGuestLobby();
}

function onHostMessage(msg) {
  const g = app.guest;
  if (!g) return;
  if (msg.t === 'lobby') {
    g.players = msg.players;
    g.gameId = msg.gameId;
    g.view = null;
    showGuestLobby();
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
    h('ol', { class: 'players' }, g.players.map((n) => h('li', {}, n))),
    h('p', { class: 'status' }, 'Waiting for the host to start…'),
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
