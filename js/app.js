// app.js — screens and game flow. The host phone holds the real game;
// other phones send moves to it and get back only what they're allowed to see.
import {
  createInvite, acceptReply, answerInvite, decodeSignal, extractCode, wrapChannel, whenOpen,
} from './net.js';
import { openOnlineTable, joinOnlineTable, extractHostId, relayAvailable, newTableId } from './net.js';
import { qrSvg, startScanner } from './qr.js';
import {
  CATALOG, catalogEntry, playersText, searchGames, loadGame, getLoadedGame, gameSource,
  loadGameFromSource, isDownloaded, downloadGame, removeDownload,
} from './library.js';

const getGame = getLoadedGame;

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
  updateChatUI();
}

// ---------- table chat (all games) ----------
// One group chat per table: short text and a few emoji. The host's phone
// holds the messages while the table is open; nothing is stored anywhere.

const CHAT_MAX = 200;
const CHAT_KEEP = 50;
const CHAT_EMOJI = ['👍', '😂', '😮', '🎉', '❤️', '😬'];
const chatState = { msgs: [], unread: 0, open: false };

function resetChat() {
  chatState.msgs = [];
  chatState.unread = 0;
  chatState.open = false;
  renderChat();
}

function chatAvailable() {
  return !!(app.host || (app.guest && app.guest.admitted));
}

function myChatName() {
  return app.host ? app.host.players[0].name : app.name;
}

function cleanChatText(t) {
  return String(t || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
}

// Host: add a message from anyone and pass it to every player.
function hostChat(from, text) {
  const host = app.host;
  const clean = cleanChatText(text);
  if (!host || !clean) return;
  const msg = { from, text: clean, at: Date.now() };
  host.chat = [...(host.chat || []), msg].slice(-100);
  sendToGuests(() => ({ t: 'chat', msg }));
  saveTable();
  receiveChat(msg);
}

function sendChatHistory(conn) {
  const host = app.host;
  conn.send({ t: 'chatHistory', msgs: (host.chat || []).slice(-CHAT_KEEP) });
}

function receiveChat(msg) {
  chatState.msgs = [...chatState.msgs, msg].slice(-CHAT_KEEP);
  if (!chatState.open && msg.from !== myChatName()) chatState.unread += 1;
  renderChat();
}

function sendChat(text) {
  const clean = cleanChatText(text);
  if (!clean) return false;
  if (app.host) {
    hostChat(app.host.players[0].name, clean);
    return true;
  }
  const g = app.guest;
  if (!g || !g.conn) {
    toast('Reconnecting… try again in a moment.');
    return false;
  }
  g.conn.send({ t: 'chat', text: clean });
  return true;
}

function updateChatUI() {
  const on = chatAvailable();
  let btn = document.getElementById('chat-btn');
  if (!on) {
    btn?.remove();
    document.getElementById('chat-panel')?.remove();
    document.body.classList.remove('has-chat');
    chatState.open = false;
    return;
  }
  document.body.classList.add('has-chat');
  if (!btn) {
    btn = h('button', { id: 'chat-btn', 'aria-label': 'Table chat', onclick: () => openChat(!chatState.open) },
      h('span', { class: 'chat-icon', 'aria-hidden': 'true' }),
      h('span', { class: 'chat-badge', id: 'chat-badge' }));
    btn.querySelector('.chat-icon').innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17.5H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z"/></svg>';
    document.body.append(btn);
  }
  renderChat();
}

function openChat(open) {
  chatState.open = open;
  if (open) chatState.unread = 0;
  renderChat();
  if (open) document.getElementById('chat-input')?.focus({ preventScroll: true });
}

function renderChat() {
  const badge = document.getElementById('chat-badge');
  if (badge) {
    badge.textContent = chatState.unread > 9 ? '9+' : String(chatState.unread || '');
    badge.hidden = !chatState.unread;
    document.getElementById('chat-btn').setAttribute('aria-label',
      chatState.unread ? `Table chat, ${chatState.unread} new` : 'Table chat');
  }
  let panel = document.getElementById('chat-panel');
  if (!chatState.open || !chatAvailable()) {
    panel?.remove();
    return;
  }
  if (!panel) {
    const input = h('input', {
      id: 'chat-input', type: 'text', maxlength: String(CHAT_MAX), placeholder: 'Message the table', 'aria-label': 'Message', autocomplete: 'off',
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } },
    });
    const submit = () => { if (sendChat(input.value)) input.value = ''; input.focus({ preventScroll: true }); };
    const emoji = h('div', { class: 'chat-emoji' }, CHAT_EMOJI.map((em) => h('button', {
      type: 'button', 'aria-label': `Add ${em}`,
      onclick: () => {
        const at = input.selectionStart ?? input.value.length;
        input.value = (input.value.slice(0, at) + em + input.value.slice(at)).slice(0, CHAT_MAX);
        input.focus({ preventScroll: true });
      },
    }, em)));
    panel = h('section', { id: 'chat-panel', role: 'dialog', 'aria-label': 'Table chat' },
      h('div', { class: 'chat-head' },
        h('h3', {}, 'Table chat'),
        app.host ? h('button', {
          class: 'quiet', onclick: () => {
            if (!confirm('Clear the chat for everyone?')) return;
            app.host.chat = [];
            sendToGuests(() => ({ t: 'chatClear' }));
            saveTable();
            chatState.msgs = [];
            renderChat();
          },
        }, 'Clear') : null,
        h('button', { onclick: () => openChat(false) }, 'Close')),
      h('ol', { class: 'chat-list', id: 'chat-list', 'aria-live': 'polite' }),
      emoji,
      h('div', { class: 'chat-send' }, input, h('button', { class: 'primary', onclick: submit }, 'Send')));
    document.body.append(panel);
  }
  const list = document.getElementById('chat-list');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.replaceChildren(...(chatState.msgs.length ? chatState.msgs.map((m) => h('li', { class: m.from === myChatName() ? 'mine' : '' },
    h('strong', {}, m.from), h('span', {}, m.text))) : [h('li', { class: 'chat-empty' }, 'No messages yet. Say hi!')]));
  if (atBottom || list.dataset.first !== '1') { list.scrollTop = list.scrollHeight; list.dataset.first = '1'; }
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

// A hidden ID for this phone, so a player who drops out can be put back in their seat.
function playerId() {
  let id = localStorage.getItem('tg-player-id');
  if (!id) {
    const r = new Uint32Array(3);
    crypto.getRandomValues(r);
    id = Array.from(r, (x) => x.toString(36)).join('');
    localStorage.setItem('tg-player-id', id);
  }
  return id;
}

function helloMsg() {
  return { t: 'hello', name: app.name, pid: playerId() };
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
  // Phone woke up: reconnect now instead of waiting.
  const g = app.guest;
  if (g && document.visibilityState === 'visible') {
    if (g.reconnecting && g.retryNow) g.retryNow();
    else if (g.conn) { g.conn.send({ t: 'ping' }); setTimeout(() => checkHost(g), 4000); }
  }
  // Back from turning on the hotspot: pick up the new address.
  if (app.host && app.host.mode === 'local' && document.visibilityState === 'visible') refreshLocalAddress();
});

// ---------- paused tables (all games) ----------
// The host's phone saves the table after every change, so closing the app or
// losing the page pauses the game instead of ending it. Players keep their seat
// and wait; when the host comes back they reconnect on their own.

const TABLE_KEY = 'tg-table';
const SEAT_KEY = 'tg-seat';

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

function saveTable() {
  const host = app.host;
  if (!host || host.ending || host.closingOut) return;
  writeJSON(TABLE_KEY, {
    v: 1,
    savedAt: Date.now(),
    tableId: host.tableId,
    net: host.net,
    players: host.players.map((p) => ({ name: p.name, pid: p.pid || null })),
    gameId: host.gameId,
    playing: host.playing || null,
    state: host.state || null,
    chat: (host.chat || []).slice(-CHAT_KEEP),
  });
}

function savedTable() {
  const t = readJSON(TABLE_KEY);
  return t && t.v === 1 && Array.isArray(t.players) && t.players.length ? t : null;
}

function clearSavedTable() {
  localStorage.removeItem(TABLE_KEY);
}

function tableSummary(t) {
  const name = (t.playing && catalogEntry(t.playing)?.name) || null;
  const others = t.players.slice(1).map((p) => p.name);
  const who = others.length ? `with ${others.join(', ')}` : 'with no players yet';
  return name ? `${name} ${who}` : `Your table ${who}`;
}

// Players: remember the table so they can find their way back to their seat.
function saveSeat(g) {
  if (!g.seat) return;
  writeJSON(SEAT_KEY, { ...g.seat, host: g.host || g.seat.host || '', savedAt: Date.now() });
}

function clearSeat() {
  localStorage.removeItem(SEAT_KEY);
}

function savedSeat() {
  const s = readJSON(SEAT_KEY);
  // A seat is only useful for a few days; after that the table is surely gone.
  return s && s.hostId && Date.now() - (s.savedAt || 0) < 3 * 24 * 3600 * 1000 ? s : null;
}

// Rebuild the host from the saved table and open it on the same link.
async function resumeTable(opts = {}) {
  const t = savedTable();
  if (!t) return showHome();
  resetChat();
  app.host = {
    players: t.players.map((p, i) => ({ name: i === 0 ? (app.name || p.name) : p.name, pid: i === 0 ? playerId() : p.pid, conn: null })),
    joining: [],
    net: t.net || 'hotspot',
    mode: 'checking',
    online: null,
    invites: new Map(),
    used: new Set(),
    current: null,
    making: null,
    gameId: t.gameId && catalogEntry(t.gameId) ? t.gameId : CATALOG[0].id,
    options: readJSON('tg-options') || {},
    state: t.state || null,
    playing: t.playing || null,
    chat: Array.isArray(t.chat) ? t.chat : [],
    tableId: t.tableId || newTableId(),
    resuming: true,
    endingOnly: !!opts.endOnly,
  };
  const host = app.host;
  chatState.msgs = host.chat.slice(-CHAT_KEEP);
  keepAwake();

  if (host.endingOnly) {
    screen(h('h2', {}, 'Ending the table…'), h('p', { class: 'status mine' }, 'Letting everyone know the game is over.'));
  } else {
    screen(h('h2', {}, 'Reopening your table…'), h('p', { class: 'status mine' }, 'Getting your game back.'));
  }

  // The game files this table needs.
  try {
    if (host.playing) await loadGame(host.playing);
  } catch {
    if (app.host !== host) return;
    toast('This phone couldn’t load the game. Connect to the internet and try again.');
    app.host = null;
    return showHome();
  }
  loadGame(host.gameId).catch(() => {});
  if (app.host !== host) return;

  if (app.local && app.local.isHostPhone && host.net !== 'online') connectLocalHost();
  else goOnline();

  if (host.endingOnly) {
    // Players reconnect every few seconds while they wait; tell each one, then close.
    setTimeout(() => { if (app.host === host) finishEnding(); }, 12000);
    return;
  }
  host.resuming = false;
  if (host.state && getGame(host.playing)) renderHostTable();
  else showLobby();
  saveTable();
  toast('Your table is back. Players will reconnect on their own.');
}

// Close a resumed table that's only open to tell players it ended.
function finishEnding() {
  clearSavedTable();
  endHosting();
}

// Host leaving the table: pause it for everyone, or end it.
function showLeaveChoice() {
  const host = app.host;
  const back = () => (host.state && host.onTable ? renderHostTable() : showLobby());
  screen(
    h('button', { class: 'back', onclick: back }, '‹ Back'),
    h('h2', {}, 'Leave the table?'),
    h('p', {}, 'If you pause, everyone keeps their seat and their phone waits for you. Open Table Games again any time and tap Resume.'),
    h('div', { class: 'stack' },
      h('button', { class: 'primary big', onclick: pauseHosting }, 'Pause and leave'),
      h('button', { class: 'big', onclick: () => { if (confirm('End this table for everyone? The game can’t be resumed.')) { clearSavedTable(); endHosting(); } } }, 'End the table for everyone'),
      h('button', { class: 'quiet', onclick: back }, 'Stay')),
  );
}

function pauseHosting() {
  const host = app.host;
  if (!host) return showHome();
  saveTable();
  sendToGuests(() => ({ t: 'hostPaused' }));
  host.closingOut = true;
  endHosting(false, { keepSave: true });
}

// The page is closing (app swiped away, tab closed): save, and tell players
// the table is paused so they start waiting right away.
window.addEventListener('pagehide', () => {
  if (!app.host || app.host.ending || app.host.endingOnly) return;
  saveTable();
  try { sendToGuests(() => ({ t: 'hostPaused' })); } catch { /* closing anyway */ }
});

function pausedTableBanner() {
  const t = savedTable();
  if (!t) return null;
  const mins = Math.max(1, Math.round((Date.now() - (t.savedAt || Date.now())) / 60000));
  const ago = mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hr ago` : `${Math.round(mins / 1440)} days ago`;
  return h('section', { class: 'game-banner paused-banner' },
    h('div', {},
      h('strong', {}, 'Your table is paused'),
      h('span', {}, `${tableSummary(t)} · paused ${ago}. Everyone is waiting for you.`)),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => resumeTable() }, 'Resume'),
      h('button', { class: 'quiet', onclick: () => { if (confirm('End this table for everyone? The game can’t be resumed.')) resumeTable({ endOnly: true }); } }, 'End it')));
}

function seatBanner() {
  const seat = savedSeat();
  if (!seat || savedTable()) return null;
  return h('section', { class: 'game-banner paused-banner' },
    h('div', {},
      h('strong', {}, `Your seat at ${seat.host ? seat.host + '’s' : 'a'} table`),
      h('span', {}, 'Go back to the table you left. Your seat and cards are waiting.')),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => { if (!needName()) connectOnline(seat.hostId, seat.net, true); } }, 'Return to table'),
      h('button', { class: 'quiet', onclick: () => { clearSeat(); showHome(); } }, 'Forget it')));
}

// ---------- home ----------

function showHome() {
  if (app.local && !app.local.isHostPhone) return showLocalJoinHome();
  // The app checks for updates in the background; look again shortly.
  if (window.TGHost && !showHome.rechecked) {
    showHome.rechecked = true;
    setTimeout(() => { if (!app.host && !app.guest && document.querySelector('.hero') && !document.querySelector('.update-banner')) showHome(); }, 6000);
  }
  screen(
    appUpdateBanner(),
    h('header', { class: 'hero' },
      h('h1', {}, 'Table Games'),
      h('p', {}, 'Card games across everyone’s phones. No internet needed — just the same Wi‑Fi or hotspot.')),
    pausedTableBanner(),
    seatBanner(),
    nameField(),
    h('div', { class: 'stack' },
      h('button', {
        class: 'primary big',
        onclick: () => {
          if (needName()) return;
          if (savedTable()) {
            if (!confirm('You have a paused table. Starting a new one ends it for everyone. Continue?')) return;
            app.afterEnding = startHosting;
            return resumeTable({ endOnly: true });
          }
          startHosting();
        },
      }, 'Host a game'),
      h('button', { class: 'big', onclick: () => { if (!needName()) showJoinScan(); } }, 'Join a game'),
      h('button', { class: 'quiet', onclick: showLibrary }, 'Games & offline downloads'),
      app.local ? null : h('button', { class: 'quiet', onclick: () => showOfflineHelp(showHome) }, 'Hosting with no internet?')),
    h('p', { class: 'note' },
      'Going somewhere without internet? Open Games & offline downloads first and save the games you want.'),
  );
}

// ---------- help: hosting with no internet ----------

// Where this copy of the site lives on GitHub (so friends' copies point to their own app).
function repoInfo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  if (m && repo) return { owner: m[1], repo };
  return { owner: 'jeremy333', repo: 'table-games' };
}

function hostAppLinks() {
  const { owner, repo } = repoInfo();
  const page = `https://github.com/${owner}/${repo}/releases/tag/host-app`;
  return {
    page,
    apk: `https://github.com/${owner}/${repo}/releases/download/host-app/TableGamesHost.apk`,
    // Opens the app if it's installed; otherwise goes to the download page.
    open: `intent://open#Intent;scheme=tablegames;package=io.github.jeremy333.tablegames;S.browser_fallback_url=${encodeURIComponent(page)};end`,
  };
}

function showOfflineHelp(back) {
  const android = /Android/i.test(navigator.userAgent);
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const links = hostAppLinks();
  screen(
    h('button', { class: 'back', onclick: back || showHome }, '‹ Back'),
    h('h2', {}, 'Hosting with no internet'),
    h('div', { class: 'help-card good' },
      h('h3', {}, 'Have cell signal? You’re all set.'),
      h('p', {}, 'Turn on your phone’s hotspot with mobile data on, open Table Games, and tap Host a game. Card games use very little data.')),
    h('div', { class: 'help-card' },
      h('h3', {}, 'No signal at all (like on a plane)?'),
      h('p', {}, 'The host needs an Android phone with the free Table Games Host app. Phone browsers can’t host on their own hotspot without internet, but the app can.'),
      ios ? h('p', { class: 'note' }, 'iPhones can’t run a hotspot without cell signal, so an Android friend will need to host. You can still join and play from your iPhone.') : null,
      h('ol', { class: 'help-steps' },
        h('li', {}, h('strong', {}, 'Before you go, while you have internet: '), 'download and install the app on the Android phone that will host.'),
        h('li', {}, 'Android will ask to allow your browser to install apps. Allow it, then tap Install. (It may warn that the app isn’t from the Play Store; that’s expected.)'),
        h('li', {}, h('strong', {}, 'At game time: '), 'open Table Games Host, tap Open hotspot settings and turn the hotspot on, then tap Host a game.'),
        h('li', {}, 'Friends scan the Wi‑Fi code to join your hotspot, then scan the game code and play in their browsers. They don’t need the app.'))),
    android ? h('div', { class: 'stack' },
      h('a', { class: 'button primary big', href: links.apk }, 'Download the host app'),
      h('a', { class: 'button big', href: links.open }, 'Open the host app (if installed)')) : h('p', { class: 'note' }, `On an Android phone, open this page and tap Download, or visit ${links.page}`),
  );
}

// ---------- games library (search + offline downloads) ----------

function showLibrary() {
  const input = h('input', {
    type: 'search', placeholder: 'Search games, or type a player count', 'aria-label': 'Search games',
    oninput: () => renderLibrary(),
  });
  const allBtn = h('button', { class: 'primary big', id: 'download-all', onclick: downloadAll }, 'Download all games');
  screen(
    h('button', { class: 'back', onclick: showHome }, '‹ Back'),
    h('h2', {}, 'Games'),
    h('p', { class: 'note' }, 'Downloaded games work with no internet. Games you open are saved automatically too.'),
    allBtn,
    h('div', { class: 'game-picker' }, input, h('div', { class: 'game-list', id: 'library-list' })),
  );
  renderLibrary();
}

async function renderLibrary() {
  const list = document.getElementById('library-list');
  if (!list) return;
  const q = list.previousElementSibling.value.trim();
  const results = searchGames(q);
  const saved = await Promise.all(results.map((g) => isDownloaded(g.id)));
  const allSaved = (await Promise.all(CATALOG.map((g) => isDownloaded(g.id)))).every(Boolean);
  if (!document.getElementById('library-list')) return;
  const allBtn = document.getElementById('download-all');
  allBtn.disabled = allSaved;
  allBtn.textContent = allSaved ? 'All games downloaded' : 'Download all games';
  list.replaceChildren(...(results.length ? results.map((g, i) => {
    const action = saved[i]
      ? h('button', { class: 'quiet', onclick: async () => { await removeDownload(g.id); renderLibrary(); } }, 'Remove')
      : h('button', {
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'Downloading…';
          try { await downloadGame(g.id); toast(`${g.name} saved for offline`); } catch { toast(`Couldn’t download ${g.name}. Check your internet.`); }
          renderLibrary();
        },
      }, 'Download');
    return h('div', { class: 'game-option static' },
      h('span', { class: 'game-name' }, g.name),
      h('span', { class: 'game-meta' }, playersText(g) + (saved[i] ? ' · saved offline' : '')),
      h('span', { class: 'game-blurb' }, g.blurb || ''),
      h('div', { class: 'game-action' }, action));
  }) : [h('p', { class: 'note' }, `No games match “${q}”.`)]));
}

async function downloadAll() {
  const btn = document.getElementById('download-all');
  btn.disabled = true;
  btn.textContent = 'Downloading…';
  let failed = 0;
  for (const g of CATALOG) {
    try { await downloadGame(g.id); } catch { failed++; }
  }
  toast(failed ? `${failed} game${failed > 1 ? 's' : ''} couldn’t download. Check your internet.` : 'All games saved for offline');
  renderLibrary();
}

function showJoinScan() {
  screen(
    h('button', { class: 'back', onclick: showHome }, '‹ Back'),
    h('h2', {}, 'Join a game'),
    h('p', {}, 'First join the host’s Wi‑Fi (scan their Wi‑Fi code). Then scan their game code, or open the link they texted you.'),
    scanOrPaste('Scan host’s game code', (text) => {
      const hostId = extractHostId(text);
      if (hostId) return joinOnline(hostId, (text.match(/[#&]net=(\w+)/) || [])[1]);
      const code = extractCode(text, 'join');
      if (!code) return toast('That isn’t a game code.');
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
    window.TGHost ? h('button', { onclick: () => window.TGHost.openHotspotSettings() }, 'Open hotspot settings') : null,
    h('div', { class: 'wifi-fields' }, ssid, pass),
    qr,
  );
}

// ---------- host ----------

// ---------- how will everyone connect? ----------
const NET_INFO = {
  online: {
    title: 'Online',
    blurb: 'Everyone uses their own internet (Wi‑Fi or mobile data), even from different places. Players scan one game code.',
  },
  hotspot: {
    title: 'Hotspot Wi‑Fi',
    blurb: 'Everyone joins your phone’s hotspot (keep mobile data on). Players scan your Wi‑Fi code, then the game code.',
  },
  offline: {
    title: 'Offline',
    blurb: 'No internet at all, like on a plane. Uses the free Table Games Host app on an Android phone. Players scan your Wi‑Fi code, then the game code.',
  },
};

function startHosting() {
  const inApp = !!(app.local && app.local.isHostPhone);
  const last = localStorage.getItem('tg-net') || 'hotspot';
  screen(
    h('button', { class: 'back', onclick: showHome }, '‹ Back'),
    h('h2', {}, 'How will everyone connect?'),
    h('div', { class: 'net-options' }, ['online', 'hotspot', 'offline'].map((net) => h('button', {
      class: 'net-option' + (net === last ? ' last' : ''),
      onclick: () => {
        localStorage.setItem('tg-net', net);
        if (net === 'offline' && !inApp) return showOfflineStart();
        openTable(net);
      },
    },
    h('strong', {}, NET_INFO[net].title + (net === last ? ' · last used' : '')),
    h('span', {}, NET_INFO[net].blurb)))),
  );
}

// Offline on the website: offline games run from the host app.
function showOfflineStart() {
  const android = /Android/i.test(navigator.userAgent);
  const links = hostAppLinks();
  screen(
    h('button', { class: 'back', onclick: startHosting }, '‹ Back'),
    h('h2', {}, 'Offline games use the host app'),
    h('p', {}, 'With no internet, the game runs from the free Table Games Host app on your phone. Friends don’t need the app; they play in their browsers.'),
    android ? h('div', { class: 'stack' },
      h('a', { class: 'button primary big', href: links.open }, 'Open the host app'),
      h('a', { class: 'button big', href: links.apk }, 'Download the host app'),
      h('p', { class: 'note' }, 'Not installed yet? Download it while you still have internet, allow your browser to install apps when Android asks, then tap Install. In the app, tap Host a game and choose Offline.'))
      : h('p', { class: 'note' }, 'The host app runs on Android phones. iPhones can’t run a hotspot without cell signal, so an Android friend will need to host. You can still join and play from any phone.'),
    h('button', { class: 'quiet', onclick: () => showOfflineHelp(showOfflineStart) }, 'More about hosting with no internet'),
  );
}

function openTable(net) {
  resetChat();
  app.host = {
    players: [{ name: app.name, conn: null }],
    joining: [],          // people connecting, waiting to be let in
    net,                  // what the host chose: 'online' | 'hotspot' | 'offline'
    mode: 'checking',     // 'online' = one scan; 'offline' = scan each player's code; 'local' = host app
    online: null,         // { link, close } when online
    invites: new Map(),   // offline join codes by id
    used: new Set(),
    current: null,        // the offline join code on screen
    making: null,
    gameId: localStorage.getItem('tg-last-game') || CATALOG[0].id,
    options: JSON.parse(localStorage.getItem('tg-options') || '{}'), // per game, remembered
    state: null,
    tableId: newTableId(), // the table's link; kept if the host leaves and comes back
    chat: [],
  };
  app.host.players[0].pid = playerId();
  if (!catalogEntry(app.host.gameId)) app.host.gameId = CATALOG[0].id;
  keepAwake();
  showLobby();
  selectGame(app.host.gameId);
  // In the host app, hotspot and offline games run from this phone; online games
  // go through the internet like the website.
  if (app.local && app.local.isHostPhone && net !== 'online') connectLocalHost();
  else goOnline();
  saveTable();
}

// Back to the connection choice (only before anyone has joined).
function changeConnection() {
  const host = app.host;
  if (host.players.length > 1 && !confirm('Changing how everyone connects will disconnect the players at your table. Continue?')) return;
  sendToGuests(() => ({ t: 'tableEnded' }));
  clearSavedTable();
  endHosting(true);
  startHosting();
}

// ---------- host app (Android): the table runs on this phone's own server ----------
// Works on the phone's hotspot with no internet; players join from their browsers.

function connectLocalHost() {
  const host = app.host;
  host.mode = 'local';
  host.address = pickAddress(app.local.addresses);
  renderAddBox();
  const ws = new WebSocket(`ws://${location.host}/ws?role=host`);
  host.ws = ws;
  const byId = new Map();
  ws.onmessage = (e) => {
    const d = String(e.data);
    const a = d.indexOf('|');
    const kind = d.slice(0, a);
    const rest = d.slice(a + 1);
    const b = rest.indexOf('|');
    const id = b < 0 ? rest : rest.slice(0, b);
    if (kind === 'join') {
      const entry = {
        name: null, status: 'connected', player: null,
        conn: { send: (m) => { if (ws.readyState === 1) ws.send(`${id}|${JSON.stringify(m)}`); }, close: () => { if (ws.readyState === 1) ws.send(`close|${id}`); } },
      };
      entry.close = () => entry.conn.close();
      byId.set(id, entry);
      host.joining.push(entry);
      updateLobby();
    } else if (kind === 'msg') {
      const entry = byId.get(id);
      if (!entry) return;
      try { onPlayerMessage(entry, JSON.parse(rest.slice(b + 1))); } catch (err) { console.error(err); }
    } else if (kind === 'leave') {
      const entry = byId.get(id);
      byId.delete(id);
      if (entry) onPlayerClosed(entry);
    }
  };
  ws.onclose = () => {
    if (app.host === host && !host.ending) toast('The table’s connection stopped. Close and reopen the app, then tap Resume.');
  };
}

// Pick the address other phones should use: the hotspot first, then Wi-Fi.
function pickAddress(addresses) {
  const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const rank = (a) => {
    if (!isPrivate(a.ip)) return 9;
    if (/^(ap|swlan|softap)/i.test(a.name)) return 0;
    if (/^wlan[1-9]/i.test(a.name)) return 1;
    if (/^(wlan|wl|eth|en)/i.test(a.name)) return 2;
    if (/^(rmnet|ccmni|v4-|dummy|tun|lo)/i.test(a.name)) return 8;
    return 3;
  };
  return (addresses || []).slice().sort((x, y) => rank(x) - rank(y))[0] || null;
}

function localJoinLink(host) {
  return host.address ? `http://${host.address.ip}:${app.local.port}/#lhost` : null;
}

// Player side: this page came from the host phone, so joining is one tap.
function showLocalJoinHome() {
  screen(
    h('header', { class: 'hero' },
      h('h1', {}, 'Table Games'),
      h('p', {}, 'You’re connected to the host’s phone. Enter your name and join.')),
    nameField(),
    h('button', { class: 'primary big', onclick: () => { if (!needName()) joinLocal(); } }, 'Join the game'),
  );
}

// Open a connection to the host app's server on this hotspot.
function connectLocal(onLost) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${location.host}/ws?role=player`);
    let opened = false;
    const conn = {
      send: (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); },
      close: () => ws.close(),
    };
    const timer = setTimeout(() => { if (!opened) { ws.close(); reject(new Error('timeout')); } }, 10000);
    ws.onopen = () => { opened = true; clearTimeout(timer); resolve(conn); };
    ws.onmessage = (e) => {
      try { onHostMessage(JSON.parse(e.data)); } catch (err) { console.error(err); }
    };
    ws.onclose = () => {
      if (!opened) { clearTimeout(timer); reject(new Error('closed')); return; }
      onLost(conn);
    };
  });
}

async function joinLocal() {
  screen(h('h2', {}, 'Joining…'), h('p', { class: 'status mine' }, 'Connecting to the host…'));
  const g = { conn: null, gameId: null, players: [], view: null, admitted: false };
  app.guest = g;
  resetChat();
  g.reconnect = () => connectLocal((c) => connectionLost(g, c));
  try {
    g.conn = await g.reconnect();
  } catch {
    if (app.guest === g) app.guest = null;
    return guestFailedLocal();
  }
  connectedToHost(g);
  screen(h('h2', {}, 'Connected'), h('p', { class: 'status mine' }, 'Waiting for the host to let you in…'));
}

function guestFailedLocal() {
  screen(
    h('h2', {}, 'Couldn’t connect'),
    h('p', {}, 'Make sure you’re still on the host’s hotspot, then try again.'),
    h('button', { class: 'primary big', onclick: joinLocal }, 'Try again'),
  );
}

// Try one-scan joining; if the hotspot has no internet, switch to offline joining.
async function goOnline(attempt = 0) {
  const host = app.host;
  host.mode = 'checking';
  renderAddBox();
  try {
    host.online = await openOnlineTable((p) => { if (app.host === host) acceptOnlinePlayer(p); }, 8000, host.tableId);
    if (window.TGHost && window.TGHost.siteUrl) host.online.link = window.TGHost.siteUrl() + '#host=' + host.online.id;
    host.online.link += `&net=${host.net}`;
    host.relay = await relayAvailable();
    if (app.host !== host) return host.online.close();
    host.mode = 'online';
  } catch (err) {
    if (app.host !== host) return;
    // Reopening a table: its link may still be held by the old page for up to a
    // minute (for example, after a phone lost signal). Keep trying the same link.
    if (err && err.type === 'unavailable-id' && attempt < 24) {
      setTimeout(() => { if (app.host === host) goOnline(attempt + 1); }, 5000);
      return;
    }
    if (err && err.type === 'unavailable-id') {
      host.tableId = newTableId(); // give up on the old link; players rescan the new code
      saveTable();
      return goOnline(0);
    }
    host.mode = 'offline';
    ensureInvite();
  }
  renderAddBox();
}

// Table settings: each game can list `options`; the host's picks are remembered.
function optionsFor(game) {
  const saved = (app.host && app.host.options[game.id]) || {};
  const out = {};
  for (const o of game.options || []) out[o.id] = o.id in saved ? saved[o.id] : o.default;
  return out;
}

function rulesText(game) {
  if (!game) return '';
  return typeof game.rules === 'function' ? game.rules(optionsFor(game)) : game.rules || '';
}

function renderOptions() {
  const box = document.getElementById('options');
  const host = app.host;
  const game = host && getGame(host.gameId);
  if (!box || !game) {
    if (box) box.replaceChildren();
    return;
  }
  const values = optionsFor(game);
  const save = (id, v) => {
    host.options[game.id] = { ...(host.options[game.id] || {}), [id]: v };
    localStorage.setItem('tg-options', JSON.stringify(host.options));
    sendToGuests(lobbyMessage);
    saveTable();
    updateLobby();
  };
  box.replaceChildren(...(game.options || []).map((o) => {
    let input;
    if (o.type === 'select') {
      input = h('select', { onchange: (e) => save(o.id, e.target.value) },
        o.choices.map(([v, label]) => h('option', { value: v, selected: String(values[o.id]) === String(v) }, label)));
    } else {
      let typing;
      input = h('input', {
        type: 'number', inputmode: 'numeric', min: o.min, max: o.max, step: o.step, value: values[o.id],
        oninput: (e) => {
          clearTimeout(typing);
          const n = Math.round(Number(e.target.value));
          if (e.target.value === '' || !Number.isFinite(n) || n < o.min || n > o.max) return;
          typing = setTimeout(() => { if (String((app.host.options[game.id] || {})[o.id]) !== String(n)) save(o.id, n); }, 250);
        },
        onchange: (e) => {
          clearTimeout(typing);
          const n = Math.round(Number(e.target.value));
          const v = Number.isFinite(n) && e.target.value !== '' ? Math.min(o.max, Math.max(o.min, n)) : o.default;
          if (e.target.value !== String(v)) e.target.value = v;
          if (String((app.host.options[game.id] || {})[o.id]) !== String(v)) save(o.id, v);
        },
      });
    }
    return h('label', { class: 'field option' }, h('span', {}, o.label), input);
  }));
  box.hidden = !(game.options || []).length;
}

function lobbyMessage() {
  const game = getGame(app.host.gameId);
  return {
    t: 'lobby', players: app.host.players.map((p) => p.name), gameId: app.host.gameId, rules: rulesText(game),
    inGame: !!app.host.state, // a game is still going: seated players stay at the table
  };
}

// Send a game's file to a phone that doesn't have it, in pieces.
async function sendGameCode(player, gameId) {
  try {
    const source = await gameSource(gameId);
    const size = 12000;
    const parts = Math.ceil(source.length / size);
    for (let i = 0; i < parts; i++) {
      player.conn?.send({ t: 'gameCode', gameId, part: i, parts, chunk: source.slice(i * size, (i + 1) * size) });
    }
  } catch {
    player.conn?.send({ t: 'error', text: 'The host couldn’t send that game.' });
  }
}

function sendToGuests(makeMsg) {
  app.host.players.forEach((p, seat) => {
    if (seat > 0 && p.conn) p.conn.send(makeMsg(seat));
  });
}

// Load a game's file (only when picked) and make it the table's game.
async function selectGame(id) {
  const host = app.host;
  const entry = catalogEntry(id);
  host.gameId = id;
  host.gameLoading = id;
  renderGamePicker();
  updateLobby();
  try {
    await loadGame(id);
    if (app.host !== host || host.gameId !== id) return;
    localStorage.setItem('tg-last-game', id);
  } catch (err) {
    if (app.host !== host) return;
    toast(navigator.onLine ? err.message : `${entry.name} isn’t downloaded on this phone. Connect to the internet to get it.`);
  }
  host.gameLoading = null;
  sendToGuests(lobbyMessage);
  saveTable();
  renderGamePicker();
  renderOptions();
  updateLobby();
}

// Search box + list of games. Shows the chosen game first.
function gamePicker() {
  const input = h('input', {
    type: 'search', placeholder: 'Search games, or type a player count', 'aria-label': 'Search games',
    oninput: () => renderGamePicker(),
  });
  return h('div', { class: 'game-picker' }, input, h('div', { class: 'game-list', id: 'game-list', role: 'listbox', 'aria-label': 'Games' }));
}

async function renderGamePicker() {
  const host = app.host;
  const list = document.getElementById('game-list');
  if (!host || !list) return;
  const q = list.previousElementSibling.value.trim();
  let results = searchGames(q);
  if (!q) results = [catalogEntry(host.gameId), ...results.filter((g) => g.id !== host.gameId)].filter(Boolean);
  const saved = await Promise.all(results.map((g) => isDownloaded(g.id)));
  if (!document.getElementById('game-list')) return;
  list.replaceChildren(...(results.length ? results.map((g, i) => {
    const chosen = g.id === host.gameId;
    return h('button', {
      class: 'game-option' + (chosen ? ' chosen' : ''), role: 'option', 'aria-selected': chosen ? 'true' : 'false',
      onclick: () => { if (!chosen) selectGame(g.id); },
    },
    h('span', { class: 'game-name' }, g.name, chosen && host.gameLoading ? h('small', {}, ' loading…') : null),
    h('span', { class: 'game-meta' }, playersText(g) + (saved[i] ? ' · saved offline' : '')),
    h('span', { class: 'game-blurb' }, g.blurb || ''));
  }) : [h('p', { class: 'note' }, `No games match “${q}”.`)]));
}

// While a game is going and the host is in the lobby: a banner to return to it.
function gameBanner() {
  const host = app.host;
  if (!host.state) return null;
  const game = getGame(host.playing);
  const view = game.viewFor(host.state, 0);
  const myTurn = view.turn === 0 && view.winner == null && !['trickEnd', 'handOver', 'roundOver', 'meld'].includes(view.phase);
  return h('section', { class: 'game-banner' + (myTurn ? ' my-turn' : ''), id: 'game-banner' },
    h('div', {},
      h('strong', {}, `${game.name} is in progress`),
      h('span', {}, myTurn ? 'It’s your turn!' : 'Players stay at the table while you’re here.')),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: renderHostTable }, 'Return to game'),
      h('button', { class: 'quiet', onclick: () => { if (confirm(`End the ${game.name} game for everyone?`)) endGame(); } }, 'End game')));
}

function updateGameBanner() {
  const old = document.getElementById('game-banner');
  const fresh = gameBanner();
  if (old && fresh) old.replaceWith(fresh);
  else if (old) old.remove();
}

function showLobby() {
  const host = app.host;
  host.onTable = false;
  screen(
    h('button', { class: 'back', onclick: showLeaveChoice }, '‹ Leave'),
    h('h2', {}, 'Your table'),
    gameBanner(),
    h('p', { class: 'net-line' }, h('span', {}, `Connection: ${NET_INFO[host.net].title}`),
      h('button', { class: 'quiet small-btn', onclick: changeConnection }, 'Change')),
    host.net === 'online' ? null : hotspotBox(),
    h('h3', { class: 'section' }, 'Game'),
    gamePicker(),
    h('div', { class: 'options', id: 'options' }),
    h('p', { class: 'rules', id: 'rules' }),
    // The game code, with the waiting room and player list right below it.
    h('section', { class: 'add-box', id: 'add-box' }),
    h('div', { id: 'joining' }),
    h('h3', { class: 'section' }, 'Players'),
    h('ol', { class: 'players', id: 'players' }),
    h('button', { class: 'primary big', id: 'start', onclick: startGame }),
  );
  renderGamePicker();
  renderOptions();
  updateLobby();
  renderAddBox();
}

function renderAddBox() {
  const host = app.host;
  const box = document.getElementById('add-box');
  if (!host || !box) return;
  const title = h('h3', { class: 'section' }, 'Add players');

  if (host.mode === 'local') {
    const link = localJoinLink(host);
    if (!link) {
      box.replaceChildren(title, h('div', { class: 'offline-note' },
        h('p', {}, 'Turn on your phone’s hotspot, then tap Refresh.'),
        h('button', { class: 'quiet', onclick: refreshLocalAddress }, 'Refresh')));
      return;
    }
    const qr = h('div', { class: 'qr' });
    qr.innerHTML = qrSvg(link);
    const others = (app.local.addresses || []).filter((a) => a.ip !== host.address.ip);
    box.replaceChildren(
      title,
      h('p', { class: 'step' }, 'Players join your hotspot (Wi‑Fi code above), then scan this game code with their camera and tap Join. No internet or app needed on their phones.'),
      qr,
      h('p', { class: 'note center' }, link),
      h('div', { class: 'row' },
        h('button', { onclick: () => shareLink(link, 'Join my card game:') }, 'Text the link'),
        h('button', { onclick: refreshLocalAddress }, 'Refresh')),
      others.length ? h('details', { class: 'addr-pick' },
        h('summary', {}, `Using ${host.address.name} (${host.address.ip}). Players can’t connect? Try another:`),
        ...others.map((a) => h('button', { class: 'quiet', onclick: () => { host.address = a; renderAddBox(); } }, `${a.name} — ${a.ip}`))) : null,
    );
    return;
  }

  if (host.mode === 'checking') {
    box.replaceChildren(title, h('p', { class: 'note' }, 'Getting your game code ready…'));
    return;
  }

  if (host.mode === 'online') {
    const qr = h('div', { class: 'qr' });
    qr.innerHTML = qrSvg(host.online.link);
    box.replaceChildren(
      title,
      h('p', { class: 'step' }, host.net === 'online'
        ? 'Players scan this game code with their camera (or open the texted link) and tap Join, from anywhere with internet. They’ll show up below for you to let in.'
        : 'Players join your hotspot (Wi‑Fi code above), then scan this game code and tap Join. They’ll show up below for you to let in.'),
      qr,
      h('div', { class: 'row' },
        h('button', { onclick: () => shareLink(host.online.link, 'Join my card game:') }, 'Text the link'),
        h('button', { onclick: () => copy(host.online.link) }, 'Copy link')),
    );
    return;
  }

  // Offline: each player's phone code has to be scanned.
  box.replaceChildren(
    title,
    h('div', { class: 'offline-note' },
      h('p', {}, 'No internet on this hotspot, so joining takes one extra step: after a player taps Join, scan the code on their phone.'),
      h('button', { class: 'quiet', onclick: goOnline }, 'Try one-scan joining again'),
      h('button', { class: 'quiet', onclick: () => showOfflineHelp(showLobby) }, 'Hosting from your own hotspot? Read this')),
    h('p', { class: 'step' }, 'Step 1 — they scan your game code and tap Join.'),
    h('div', { class: 'qr', id: 'invite-qr' }, h('p', { class: 'note' }, 'Making a game code…')),
    h('p', { class: 'note', id: 'invite-note' }),
    h('div', { class: 'row' },
      h('button', { onclick: () => (host.current ? shareLink(host.current.link, 'Join my card game:') : toast('Making a new game code…')) }, 'Text the link'),
      h('button', { onclick: () => (host.current ? copy(host.current.link) : toast('Making a new game code…')) }, 'Copy link')),
    h('p', { class: 'step' }, 'Step 2 — scan the code that appears on their phone.'),
    scanOrPaste('Scan a player’s code', (text) => {
      const code = extractCode(text, 'reply');
      if (!code) return toast('That isn’t a player’s code.');
      handleReply(code);
    }),
  );
  renderInvite();
}

async function refreshLocalAddress() {
  try {
    const info = await (await fetch('/tg-local/info', { cache: 'no-store' })).json();
    app.local.addresses = info.addresses;
    if (app.host) app.host.address = pickAddress(info.addresses);
  } catch { /* keep the old list */ }
  renderAddBox();
}

function acceptOnlinePlayer(p) {
  const host = app.host;
  const entry = { name: null, status: 'connecting', conn: null, player: null, close: null };
  host.joining.push(entry);
  updateLobby();
  const { conn, opened } = p.attach((msg) => onPlayerMessage(entry, msg), () => onPlayerClosed(entry));
  entry.conn = conn;
  entry.close = () => conn.close();
  entry.online = true;
  entry.timer = setTimeout(() => {
    if (entry.status === 'connecting' && host.joining.includes(entry)) { entry.status = 'failed'; updateLobby(); }
  }, 25000);
  opened.then(() => { if (entry.status === 'connecting' || entry.status === 'failed') { entry.status = 'connected'; updateLobby(); } });
}

// Messages from a player's phone (both joining methods).
function onPlayerMessage(entry, msg) {
  const host = app.host;
  if (!host) return;
  if (msg.t === 'ping') {
    entry.conn.send({ t: 'pong' });
    return;
  }
  if (msg.t === 'chat') {
    if (!entry.player) return;
    const now = Date.now();
    if (now - (entry.lastChat || 0) < 600) return; // no flooding
    entry.lastChat = now;
    hostChat(entry.player.name, msg.text);
    return;
  }
  if (msg.t === 'hello' && host.endingOnly) {
    entry.conn.send({ t: 'tableEnded' });
    return;
  }
  if (msg.t === 'hello' && !entry.name) {
    clearTimeout(entry.timer);
    const pid = typeof msg.pid === 'string' ? msg.pid.slice(0, 40) : null;
    const seated = pid && host.players.find((p, i) => i > 0 && p.pid === pid);
    if (seated) return rejoin(entry, seated);
    entry.pid = pid;
    entry.name = String(msg.name || 'Player').slice(0, 16);
    entry.status = 'waiting';
    updateLobby();
    const box = document.getElementById('joining');
    if (!box) {
      toast(`${entry.name} wants to join — let them in from the lobby`);
    } else {
      toast(`${entry.name} wants to join`);
      box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    }
  } else if (msg.t === 'move' && entry.player) {
    hostMove(host.players.indexOf(entry.player), msg.move);
  } else if (msg.t === 'needGame' && entry.player && catalogEntry(msg.gameId)) {
    sendGameCode(entry.player, msg.gameId);
  }
}

// The same phone came back (screen went to sleep, signal dropped): back into its seat.
function rejoin(entry, player) {
  const host = app.host;
  host.joining = host.joining.filter((e) => e !== entry);
  const old = player.conn;
  player.conn = entry.conn;
  entry.player = player;
  entry.name = player.name;
  if (old && old !== entry.conn) { try { old.close(); } catch { /* already gone */ } }
  entry.conn.send({ t: 'admitted', host: host.players[0].name });
  sendChatHistory(entry.conn);
  entry.conn.send(lobbyMessage());
  const seat = host.players.indexOf(player);
  if (host.state && seat < host.state.names.length) sendView(seat);
  toast(`${player.name} reconnected`);
  if (host.state && host.onTable) renderHostTable();
  else { updateLobby(); updateGameBanner(); }
}

function onPlayerClosed(entry) {
  const host = app.host;
  if (!host) return;
  if (entry.player) {
    if (!host.players.includes(entry.player)) return;
    if (entry.player.conn !== entry.conn) return; // already replaced by a reconnect
    entry.player.conn = null; // keep their seat; their phone reconnects on its own
    toast(`${entry.player.name} lost connection — waiting for them to reconnect`);
    if (host.state) {
      if (host.onTable) renderHostTable();
    } else {
      sendToGuests(lobbyMessage);
      updateLobby();
    }
  } else if (host.joining.includes(entry)) {
    host.joining = host.joining.filter((e) => e !== entry);
    updateLobby();
  }
}

const STATUS_TEXT = {
  connecting: 'Connecting…',
  connected: 'Connected — getting their name…',
  waiting: 'Wants to join',
  failed: 'Couldn’t connect. Check they’re on your hotspot, then have them scan your game code again.',
};

function updateLobby() {
  const host = app.host;
  const list = document.getElementById('players');
  if (!host || !list) return; // lobby isn't on screen
  const game = getGame(host.gameId);
  // Only touch what changed, so a tap that's in progress (like Start) isn't lost.
  setText(document.getElementById('rules'), rulesText(game));

  const playersKey = host.players.map((p) => `${p.name}:${!!p.conn}`).join('|');
  if (list.dataset.key !== playersKey) {
    list.dataset.key = playersKey;
    list.replaceChildren(...host.players.map((p, i) => h('li', {}, p.name,
      i === 0 ? h('small', {}, ' (you, host)') : null,
      i > 0 && !p.conn ? h('small', { class: 'warn' }, ' reconnecting… ') : null,
      i > 0 && !p.conn ? h('button', {
        class: 'quiet small-btn',
        onclick: () => {
          host.players = host.players.filter((x) => x !== p);
          sendToGuests(lobbyMessage);
          saveTable();
          updateLobby();
        },
      }, 'Remove') : null)));
  }

  const box = document.getElementById('joining');
  const joinKey = `${host.relay}|` + host.joining.map((e) => `${e.name}:${e.status}`).join('|');
  if (box.dataset.key === joinKey) {
    // unchanged
  } else if (host.joining.length === 0) {
    box.dataset.key = joinKey;
    box.replaceChildren();
  } else {
    box.dataset.key = joinKey;
    const waiting = host.joining.filter((e) => e.status === 'waiting');
    box.replaceChildren(h('section', { class: 'joining-box' },
      h('div', { class: 'joining-head' },
        h('h3', {}, 'Joining'),
        waiting.length > 1 ? h('button', { class: 'primary', onclick: () => waiting.forEach(admit) }, 'Let everyone in') : null),
      h('ul', {}, host.joining.map((e) => h('li', { class: `join-${e.status}` },
        h('div', {},
          h('strong', {}, e.name || 'New player'),
          h('span', { class: 'join-state' }, e.status === 'failed' && e.online ? (host.relay
            ? 'Couldn’t connect. Have them check their internet, then scan your game code again.'
            : 'Couldn’t connect — this Wi‑Fi blocks phones from linking directly. Turning on the relay fixes this (see README).')
            : STATUS_TEXT[e.status])),
        h('div', { class: 'join-actions' },
          e.status === 'waiting' ? h('button', { class: 'primary', onclick: () => admit(e) }, 'Let in') : null,
          e.status === 'waiting' ? h('button', { onclick: () => decline(e) }, 'Decline') : null,
          e.status === 'failed' ? h('button', { onclick: () => dismiss(e) }, 'Dismiss') : null))))));
  }

  const count = host.players.length;
  const start = document.getElementById('start');
  if (!game) {
    if (!start.disabled) start.disabled = true;
    setText(start, host.gameLoading ? 'Loading game…' : 'Pick a game');
    return;
  }
  const canStart = count >= game.minPlayers && count <= game.maxPlayers;
  if (start.disabled !== !canStart) start.disabled = !canStart;
  setText(start, canStart ? `Start ${game.name}`
    : count < game.minPlayers ? `${game.name} needs ${game.minPlayers}${game.maxPlayers > game.minPlayers ? '–' + game.maxPlayers : ''} players`
      : `${game.name} allows up to ${game.maxPlayers} players`);
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
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
  if (!host || !box) return;
  if (!host.current) {
    box.replaceChildren(h('p', { class: 'note' }, 'Making a new join code…'));
    return;
  }
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

  const entry = { id: reply.i, name: null, status: 'connecting', conn: null, player: null, close: () => invite.pc.close() };
  host.joining.push(entry);
  if (host.current && host.current.id === reply.i) {
    host.current = null;
    renderInvite(); // never leave a used code on screen
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
  entry.timer = setTimeout(() => { if (entry.status === 'connecting') setStatus('failed'); }, 20000);
  invite.pc.addEventListener('connectionstatechange', () => {
    if (invite.pc.connectionState === 'failed' && !entry.name) setStatus('failed');
  });
  const opened = () => { if (entry.status === 'connecting' || entry.status === 'failed') setStatus('connected'); };
  if (invite.channel.readyState === 'open') opened();
  else invite.channel.addEventListener('open', opened, { once: true });
  entry.conn = wrapChannel(invite.channel, (msg) => onPlayerMessage(entry, msg), () => onPlayerClosed(entry));
  return true;
}

function admit(entry) {
  const host = app.host;
  if (!host.joining.includes(entry) || !entry.name) return;
  host.joining = host.joining.filter((e) => e !== entry);
  entry.player = { name: entry.name, conn: entry.conn, pid: entry.pid };
  host.players.push(entry.player);
  entry.conn.send({ t: 'admitted', host: host.players[0].name });
  sendChatHistory(entry.conn);
  if (host.state) {
    entry.conn.send(lobbyMessage()); // plays from the next round
  } else {
    sendToGuests(lobbyMessage);
  }
  toast(`${entry.name} joined`);
  saveTable();
  updateLobby();
}

function decline(entry) {
  const host = app.host;
  host.joining = host.joining.filter((e) => e !== entry);
  entry.conn?.send({ t: 'declined' });
  setTimeout(() => entry.close && entry.close(), 500);
  updateLobby();
}

function dismiss(entry) {
  const host = app.host;
  host.joining = host.joining.filter((e) => e !== entry);
  if (entry.close) entry.close();
  updateLobby();
}

function startGame(gameId) {
  const host = app.host;
  const id = typeof gameId === 'string' ? gameId : host.gameId;
  const game = getGame(id);
  if (!game) return toast('That game isn’t loaded yet.');
  if (host.state) {
    const current = getGame(host.playing);
    const over = current && current.viewFor(host.state, 0).winner != null;
    if (!over && !confirm(`End the ${current ? current.name : 'current'} game and start ${game.name}?`)) return;
  }
  host.players = host.players.filter((p, i) => i === 0 || p.conn);
  if (host.players.length < game.minPlayers || host.players.length > game.maxPlayers) {
    toast(`${game.name} needs ${game.minPlayers}–${game.maxPlayers} players.`);
    return showLobby();
  }
  host.playing = id;
  host.state = game.setup(host.players.map((p) => p.name), optionsFor(game));
  host.onTable = true;
  saveTable();
  sendAllViews();
}

// End the game in progress and bring everyone back to the lobby.
function endGame() {
  const host = app.host;
  host.state = null;
  host.playing = null;
  sendToGuests(lobbyMessage);
  saveTable();
  showLobby();
}

function sendView(seat) {
  const host = app.host;
  const game = getGame(host.playing);
  const p = host.players[seat];
  if (seat >= host.state.names.length) return; // joined mid-game; plays next round
  if (p && p.conn) p.conn.send({ t: 'view', gameId: host.playing, view: game.viewFor(host.state, seat) });
}

function sendAllViews() {
  const host = app.host;
  host.players.forEach((_, seat) => { if (seat > 0) sendView(seat); });
  if (host.onTable) renderHostTable();
  else updateGameBanner(); // the host is in the lobby: just refresh the "game in progress" banner
}

function hostMove(seat, move) {
  const host = app.host;
  if (!host.state || seat < 0) return;
  const err = getGame(host.playing).applyMove(host.state, seat, move);
  if (err) {
    if (seat === 0) toast(err);
    else host.players[seat].conn?.send({ t: 'error', text: err });
    return;
  }
  saveTable();
  sendAllViews();
}

function renderHostTable() {
  const host = app.host;
  const game = getGame(host.playing);
  const view = game.viewFor(host.state, 0);
  host.onTable = true;
  const table = h('div', { class: 'table' });
  const waiting = host.joining.filter((e) => e.status === 'waiting').length;
  const away = host.players.filter((p, i) => i > 0 && i < host.state.names.length && !p.conn).map((p) => p.name);
  screen(
    away.length ? h('p', { class: 'away-note' },
      `Waiting for ${away.join(' and ')} to reconnect. Their phone will rejoin on its own when it wakes up.`) : null,
    h('div', { class: 'topbar' },
      h('button', {
        class: 'back',
        // Visit the lobby without ending the game (a finished game ends here).
        onclick: () => (view.winner != null ? endGame() : showLobby()),
      }, waiting ? `‹ Lobby (${waiting} waiting)` : '‹ Lobby'),
      h('span', {}, game.name),
      view.winner != null ? h('button', { class: 'primary', onclick: () => startGame(host.playing) }, 'Play again') : null),
    table,
  );
  game.render(view, table, (move) => hostMove(0, move));
}

function endHosting(quiet, { keepSave = false } = {}) {
  const host = app.host;
  if (host && !keepSave) {
    try { sendToGuests(() => ({ t: 'tableEnded' })); } catch { /* connections already closed */ }
    clearSavedTable();
  }
  if (host) {
    host.ending = true;
    // Close a moment later, so the last message reaches every phone first.
    setTimeout(() => {
      host.players.forEach((p) => p.conn?.close());
      host.joining.forEach((e) => e.close && e.close());
      host.invites.forEach((inv) => inv.pc.close());
      host.online?.close();
      host.ws?.close();
    }, 400);
  }
  app.host = null;
  resetChat();
  if (app.pendingReload) return setTimeout(() => location.reload(), 500); // the host app downloaded newer games
  const next = app.afterEnding;
  app.afterEnding = null;
  if (next) return next();
  if (!quiet) showHome();
}

// Replies opened from a text message arrive in a new tab; pass them to the game tab.
if (bc) {
  bc.addEventListener('message', async (e) => {
    if (e.data?.type === 'reply' && app.host && app.host.mode === 'offline') {
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

// One-scan join: connect through the introduction service, then wait to be let in.
function joinOnline(hostId, net) {
  // Coming back to a table this phone already has a seat at: go straight in.
  const seat = savedSeat();
  if (app.name && seat && seat.hostId === hostId) return connectOnline(hostId, net || seat.net, true);
  screen(
    h('h2', {}, 'Join a game'),
    h('p', { class: 'note' }, net === 'online'
      ? 'You can join from anywhere with internet.'
      : 'Make sure you’re on the host’s Wi‑Fi or hotspot first.'),
    nameField(),
    h('button', { class: 'primary big', onclick: () => { if (!needName()) connectOnline(hostId, net, false); } }, 'Join'),
  );
}

async function connectOnline(hostId, net, returning) {
  screen(h('h2', {}, returning ? 'Returning to your table…' : 'Joining…'), h('p', { class: 'status mine' }, 'Connecting to the host…'));
  const g = { conn: null, gameId: null, players: [], view: null, admitted: false, seat: { hostId, net: net || 'online' } };
  app.guest = g;
  resetChat();
  g.reconnect = async () => {
    const holder = {};
    holder.conn = await joinOnlineTable(hostId, app.name, onHostMessage, () => connectionLost(g, holder.conn));
    return holder.conn;
  };
  try {
    g.conn = await g.reconnect();
  } catch (err) {
    if (app.guest !== g) return;
    const gone = err && err.type === 'peer-unavailable';
    // The host has paused this table: wait in the seat for them to come back.
    if (gone && savedSeat()?.hostId === hostId) {
      g.hostAway = true;
      g.host = savedSeat().host;
      return startReconnecting(g);
    }
    app.guest = null;
    const relay = await relayAvailable();
    return guestFailed(gone
      ? 'That table isn’t open right now. If the host paused it, try again when they’re back, or ask them for their current game code.'
      : relay
        ? 'Couldn’t reach the host. Check your internet connection, then scan the host’s game code again.'
        : 'Couldn’t reach the host. This Wi‑Fi may block phones from linking directly. Ask the host to turn on the relay (see the README), or try the host’s hotspot instead.');
  }
  connectedToHost(g);
  screen(h('h2', {}, 'Connected'), h('p', { class: 'status mine' }, returning ? 'Getting your seat back…' : 'Waiting for the host to let you in…'));
}

// ---------- staying connected (all games) ----------
// Phones that sleep or lose signal drop off. Players reconnect on their own and
// the host puts the same phone back into its seat.

function connectedToHost(g) {
  keepAwake();
  g.lastPong = Date.now();
  g.conn.send(helloMsg());
  clearInterval(g.heartbeat);
  g.heartbeat = setInterval(() => checkHost(g), 5000);
}

// Ping the host; if it has gone quiet (for example after the screen was off), reconnect.
function checkHost(g) {
  if (app.guest !== g) return clearInterval(g.heartbeat);
  if (g.reconnecting || !g.conn) return;
  if (Date.now() - g.lastPong > 16000) {
    const dead = g.conn;
    g.conn = null;
    try { dead.close(); } catch { /* ignore */ }
    return g.reconnect ? startReconnecting(g) : onHostLost();
  }
  g.conn.send({ t: 'ping' });
}

function connectionLost(g, conn) {
  if (app.guest !== g || g.conn !== conn) return; // an old connection closing late
  g.conn = null;
  if (g.reconnect) startReconnecting(g);
  else onHostLost();
}

function renderWaiting(g) {
  if (app.guest !== g || !g.reconnecting) return;
  const who = g.host || 'the host';
  const away = g.hostAway || Date.now() - g.waitingSince > 30000;
  // Only redraw when the message changes (this runs on every retry).
  if (g.waitKey === String(away) && document.getElementById('waiting')) return;
  g.waitKey = String(away);
  screen(
    h('span', { id: 'waiting', hidden: true }),
    h('h2', {}, away ? 'Game paused' : 'Reconnecting…'),
    h('p', { class: 'status mine' }, away
      ? `Waiting for ${who} to come back. You’ll be back in your seat automatically.`
      : 'Lost the connection to the host (maybe your screen turned off). Getting you back into your seat…'),
    h('p', { class: 'note' }, away
      ? 'You can leave this screen. Open Table Games later and tap Return to table, or open the same game link again.'
      : 'Stay on the host’s Wi‑Fi or hotspot.'),
    h('button', { class: 'quiet', onclick: () => leaveForNow(g) }, 'Leave for now'),
  );
}

// Step away from a paused table; the seat stays saved so the player can return.
function leaveForNow(g) {
  g.reconnecting = false;
  clearTimeout(g.retry);
  clearInterval(g.heartbeat);
  try { g.conn?.close(); } catch { /* already closed */ }
  app.guest = null;
  showHome();
}

function startReconnecting(g) {
  if (app.guest !== g) return;
  if (g.reconnecting) return renderWaiting(g);
  g.reconnecting = true;
  g.waitingSince = Date.now();
  renderWaiting(g);
  const attempt = async () => {
    if (app.guest !== g || !g.reconnecting) return;
    try {
      const conn = await g.reconnect();
      if (app.guest !== g || !g.reconnecting) { conn.close(); return; }
      g.conn = conn;
      g.reconnecting = false;
      g.hostAway = false;
      connectedToHost(g); // the host recognises this phone and sends the game back
    } catch (err) {
      if (app.guest !== g || !g.reconnecting) return;
      if (err && err.type === 'peer-unavailable') g.hostAway = true;
      renderWaiting(g);
      // Try often at first, then settle into a slower, battery-friendly pace.
      const waited = Date.now() - g.waitingSince;
      g.retry = setTimeout(attempt, waited < 60000 ? 3000 : waited < 600000 ? 8000 : 20000);
    }
  };
  g.retryNow = () => { clearTimeout(g.retry); attempt(); };
  attempt();
}

function tableEnded() {
  const g = app.guest;
  if (g) {
    g.reconnecting = false;
    clearTimeout(g.retry);
    clearInterval(g.heartbeat);
  }
  clearSeat();
  app.guest = null;
  screen(
    h('h2', {}, 'The table has ended'),
    h('p', {}, `${g?.host || 'The host'} ended this table. Thanks for playing!`),
    h('button', { class: 'primary big', onclick: showHome }, 'Home'),
  );
}

function onHostLost() {
  if (!app.guest) return;
  clearInterval(app.guest.heartbeat);
  app.guest = null;
  screen(
    h('h2', {}, 'Disconnected from the host'),
    h('p', {}, 'Scan the host’s game code again. You’ll go straight back to your seat. If the host paused the table, do this when they’re back.'),
    h('button', { class: 'primary big', onclick: showJoinScan }, 'Rejoin'),
    h('button', { class: 'quiet', onclick: showHome }, 'Home'),
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
  resetChat();
  const g = app.guest;
  const conn = wrapChannel(channel, onHostMessage, () => connectionLost(g, conn));
  g.conn = conn;
  await whenOpen(channel);
  done = true;
  connectedToHost(g);
  screen(
    h('h2', {}, 'Connected'),
    h('p', { class: 'status mine' }, 'Waiting for the host to let you in…'),
  );
}

// Make sure this phone has the host's game: from its own copy, the internet,
// or (offline) sent over by the host.
function ensureGame(gameId) {
  const g = app.guest;
  if (getGame(gameId)) return Promise.resolve(getGame(gameId));
  g.loads = g.loads || {};
  if (g.loads[gameId]) return g.loads[gameId];
  g.loads[gameId] = loadGame(gameId).catch(() => new Promise((resolve, reject) => {
    g.codeWaiters = g.codeWaiters || {};
    g.codeWaiters[gameId] = { resolve, reject, parts: [] };
    g.conn.send({ t: 'needGame', gameId });
    setTimeout(() => reject(new Error('timeout')), 20000);
  })).catch((err) => {
    delete g.loads[gameId];
    throw err;
  });
  return g.loads[gameId];
}

function onGameCode(msg) {
  const w = app.guest?.codeWaiters?.[msg.gameId];
  if (!w) return;
  w.parts[msg.part] = msg.chunk;
  if (w.parts.filter((x) => x != null).length < msg.parts) return;
  delete app.guest.codeWaiters[msg.gameId];
  loadGameFromSource(msg.gameId, w.parts.join('')).then(w.resolve, w.reject);
}

function onHostMessage(msg) {
  const g = app.guest;
  if (!g) return;
  if (msg.t === 'gameCode') return onGameCode(msg);
  if (msg.t === 'pong') { g.lastPong = Date.now(); return; }
  if (msg.t === 'chat') { if (msg.msg) receiveChat(msg.msg); return; }
  if (msg.t === 'chatHistory') {
    const seen = chatState.msgs.length;
    chatState.msgs = Array.isArray(msg.msgs) ? msg.msgs.slice(-CHAT_KEEP) : [];
    if (!seen) chatState.unread = 0; // first history on joining: nothing is "new" yet
    renderChat();
    return;
  }
  if (msg.t === 'chatClear') { chatState.msgs = []; renderChat(); return; }
  if (msg.t === 'tableEnded') return tableEnded();
  if (msg.t === 'hostPaused') {
    g.hostAway = true;
    if (g.reconnecting) renderWaiting(g);
    return;
  }
  if (msg.t === 'admitted') {
    g.admitted = true;
    g.host = msg.host;
    saveSeat(g);
    showGuestLobby();
  } else if (msg.t === 'declined') {
    clearSeat();
    app.guest = null;
    screen(
      h('h2', {}, 'Not let in'),
      h('p', {}, 'The host didn’t add you to this table.'),
      h('button', { class: 'big', onclick: showHome }, 'Home'),
    );
  } else if (msg.t === 'lobby') {
    g.players = msg.players;
    g.rules = msg.rules;
    if (msg.inGame && g.view) return; // the host is just visiting the lobby; stay in the game
    g.gameId = msg.gameId;
    g.view = null;
    if (g.admitted) showGuestLobby();
    if (g.gameId) ensureGame(g.gameId).then(() => { if (g.admitted && !g.view) showGuestLobby(); }).catch(() => {});
  } else if (msg.t === 'view') {
    g.gameId = msg.gameId;
    g.view = msg.view;
    ensureGame(msg.gameId).then(renderGuestTable, () => {
      screen(h('h2', {}, 'Couldn’t load the game'),
        h('p', {}, 'Your phone couldn’t get this game. Ask the host to go back to the lobby and start again.'));
    });
  } else if (msg.t === 'error') {
    toast(msg.text);
  }
}

function showGuestLobby() {
  const g = app.guest;
  const entry = g.gameId ? catalogEntry(g.gameId) : null;
  const ready = g.gameId && getGame(g.gameId);
  screen(
    h('h2', {}, 'You’re in'),
    entry ? h('p', { class: 'rules' }, h('strong', {}, entry.name + '. '), g.rules || '') : null,
    entry && !ready ? h('p', { class: 'note' }, 'Getting the game ready on your phone…') : null,
    g.players.length ? h('ol', { class: 'players' }, g.players.map((n) => h('li', {}, n))) : null,
    h('p', { class: 'status' }, `Waiting for ${g.host || 'the host'} to start…`),
  );
}

function renderGuestTable() {
  const g = app.guest;
  if (!g || !g.view) return;
  const game = getGame(g.gameId);
  if (!game) return;
  const table = h('div', { class: 'table' });
  screen(h('div', { class: 'topbar' }, h('span', {}, game.name)), table);
  game.render(g.view, table, (move) => g.conn.send({ t: 'move', move }));
}

// ---------- start ----------

// Is this page being served by the Table Games host app on someone's phone?
async function detectLocal() {
  if (location.protocol !== 'http:') return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch('/tg-local/info', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const info = await res.json();
    info.isHostPhone = ['127.0.0.1', 'localhost'].includes(location.hostname);
    return info;
  } catch {
    return null;
  }
}

function route() {
  const hash = location.hash;
  history.replaceState(null, '', location.pathname);
  if (app.local && !app.local.isHostPhone) return hash.includes('lhost') ? showLocalJoinHome() : showHome();
  const hostId = extractHostId(hash);
  const join = extractCode(hash, 'join');
  const reply = extractCode(hash, 'reply');
  if (hostId) return joinOnline(hostId, (hash.match(/[#&]net=(\w+)/) || [])[1]);
  if (join) return joinWithCode(join);
  if (reply) return deliverReplyFromLink(reply);
  showHome();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (new URLSearchParams(location.search).has('debug')) window.__tg = app; // for testing only

// Host app: newer games/site were downloaded in the background.
window.tgAppUpdated = () => {
  if (!app.host && !app.guest) { location.reload(); return; }
  app.pendingReload = true;
  toast('New games and updates downloaded. They’ll load when this table ends.');
};

// Host app: offer an update when the app itself has a newer version.
function appUpdateBanner() {
  if (!window.TGHost || !window.TGHost.updateInfo) return null;
  let info;
  try { info = JSON.parse(window.TGHost.updateInfo()); } catch { return null; }
  if (!(info.latest > info.version)) return null;
  return h('div', { class: 'update-banner' },
    h('p', {}, 'A new version of the host app is available.'),
    h('button', { class: 'primary', onclick: () => window.TGHost.openUpdate() }, 'Update the app'),
    h('p', { class: 'note' }, 'It downloads, then tap it to install over this one.'));
}

detectLocal().then((info) => {
  app.local = info;
  route();
});
window.__tgStarted = true;
