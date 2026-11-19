// library.js — finds, loads, and downloads games listed in games/catalog.js.
// Games load only when picked, and each one can be saved for offline play.
import { CATALOG } from '../games/catalog.js';

export { CATALOG };

const GAME_CACHE = 'tg-games';
const gamesBase = new URL('../games/', import.meta.url);
const jsBase = new URL('../js/', import.meta.url).href;
const loaded = new Map();

export const catalogEntry = (id) => CATALOG.find((g) => g.id === id);

export function playersText(e) {
  return e.min === e.max ? `${e.min} players` : `${e.min}–${e.max} players`;
}

function fileUrls(e) {
  return [e.file, ...(e.assets || [])].map((f) => new URL(f, gamesBase).href);
}

// Search by name, tags, or blurb. A number finds games for that many players.
export function searchGames(query) {
  const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return CATALOG.filter((g) => words.every((w) => {
    if (/^\d+$/.test(w)) return g.min <= +w && +w <= g.max;
    return `${g.name} ${(g.tags || []).join(' ')} ${g.blurb || ''}`.toLowerCase().includes(w);
  }));
}

// ---------- loading ----------

function finish(mod, e) {
  const missing = ['setup', 'viewFor', 'applyMove', 'render'].filter((k) => typeof mod?.[k] !== 'function');
  if (missing.length) throw new Error(`${e.name} can’t start: its file is missing ${missing.join(', ')}.`);
  mod.id = e.id;
  mod.name = mod.name || e.name;
  mod.minPlayers = mod.minPlayers ?? e.min;
  mod.maxPlayers = mod.maxPlayers ?? e.max;
  if (mod.styles && !document.querySelector(`style[data-game="${e.id}"]`)) {
    const st = document.createElement('style');
    st.dataset.game = e.id;
    st.textContent = mod.styles;
    document.head.append(st);
  }
  loaded.set(e.id, mod);
  return mod;
}

export function getLoadedGame(id) {
  return loaded.get(id) || null;
}

export async function loadGame(id) {
  if (loaded.has(id)) return loaded.get(id);
  const e = catalogEntry(id);
  if (!e) throw new Error('That game isn’t in this version of Table Games. Reload while online to update.');
  const mod = finish((await import(new URL(e.file, gamesBase).href)).default, e);
  if (navigator.onLine) downloadGame(id).catch(() => {}); // games you open are kept for offline
  return mod;
}

// The host can send a game's file to a phone that doesn't have it (works offline).
export async function gameSource(id) {
  const e = catalogEntry(id);
  const res = await fetch(new URL(e.file, gamesBase));
  if (!res.ok) throw new Error('Game file not found');
  return res.text();
}

export async function loadGameFromSource(id, source) {
  if (loaded.has(id)) return loaded.get(id);
  const e = catalogEntry(id) || { id, name: id, min: 1, max: 99 };
  // Games may import shared code from ../js/; point those at this site.
  const fixed = source.replace(/((?:from|import)\s*\(?\s*)(['"])\.\.\/js\//g, `$1$2${jsBase}`);
  const url = URL.createObjectURL(new Blob([fixed], { type: 'text/javascript' }));
  try {
    return finish((await import(url)).default, e);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- offline downloads ----------

export async function isDownloaded(id) {
  const e = catalogEntry(id);
  if (!e || !('caches' in window)) return false;
  const cache = await caches.open(GAME_CACHE);
  for (const u of fileUrls(e)) if (!(await cache.match(u))) return false;
  return true;
}

export async function downloadGame(id) {
  const e = catalogEntry(id);
  const cache = await caches.open(GAME_CACHE);
  await Promise.all(fileUrls(e).map(async (u) => {
    const res = await fetch(u, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Couldn’t download ${e.name}`);
    await cache.put(u, res);
  }));
}

export async function removeDownload(id) {
  const e = catalogEntry(id);
  const cache = await caches.open(GAME_CACHE);
  await Promise.all(fileUrls(e).map((u) => cache.delete(u)));
}
