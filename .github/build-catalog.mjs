// Builds games/catalog.js from the game files in games/.
// GitHub runs this automatically every time something is uploaded (see
// .github/workflows/build-host-app.yml), so adding a game is just uploading
// its file to games/. Run it yourself with: node .github/build-catalog.mjs
//
// Each game's list entry comes from its own file, where present:
//   name, blurb, tags, assets, minPlayers, maxPlayers  (see ADDING-A-GAME.md)
// Anything a game file leaves out is kept from the current catalog, and a
// brand-new game with no name gets one from its file name.

import { readdir, readFile, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'games');
const NOT_GAMES = new Set(['catalog.js', 'index.js', 'template.js']);

// Load the files as modules from a scratch copy, so this works on any Node
// version without changing the site itself.
const scratch = await mkdtemp(join(tmpdir(), 'tg-catalog-'));
await cp(join(root, 'games'), join(scratch, 'games'), { recursive: true });
await cp(join(root, 'js'), join(scratch, 'js'), { recursive: true });
await writeFile(join(scratch, 'package.json'), '{"type":"module"}');
const load = async (file) => (await import(pathToFileURL(join(scratch, 'games', file)).href));

let current = [];
try { current = (await load('catalog.js')).CATALOG || []; } catch { /* first run, or a broken catalog */ }
const byFile = new Map(current.map((e) => [e.file, e]));

const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const files = (await readdir(gamesDir)).filter((f) => f.endsWith('.js') && !NOT_GAMES.has(f) && !f.startsWith('_'));
const warnings = [];
const entries = [];

for (const file of files) {
  const old = byFile.get(file);
  let game = null;
  try {
    game = (await load(file)).default;
  } catch (err) {
    warnings.push(`${file}: couldn’t be read (${err.message.split('\n')[0]})`);
  }
  if (!game || typeof game.setup !== 'function' || typeof game.render !== 'function') {
    if (old) { entries.push(old); warnings.push(`${file}: kept its old list entry`); }
    else warnings.push(`${file}: not added (it doesn’t look like a game file)`);
    continue;
  }
  const id = game.id || old?.id || file.replace(/\.js$/, '');
  const entry = {
    id,
    file,
    name: game.name || old?.name || titleCase(id),
    min: game.minPlayers ?? old?.min ?? 1,
    max: game.maxPlayers ?? old?.max ?? 99,
    blurb: game.blurb ?? old?.blurb ?? '',
    tags: game.tags ?? old?.tags ?? [],
  };
  const assets = game.assets ?? old?.assets;
  if (assets && assets.length) entry.assets = assets;
  entries.push(entry);
}

// Keep the current order; new games go at the end, A to Z.
const order = new Map(current.map((e, i) => [e.file, i]));
entries.sort((a, b) => (order.get(a.file) ?? 1e9) - (order.get(b.file) ?? 1e9) || a.name.localeCompare(b.name));
const ids = new Set();
for (const e of entries) {
  if (ids.has(e.id)) throw new Error(`Two games use the id "${e.id}". Give one of them a different id.`);
  ids.add(e.id);
}

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const val = (v) => (Array.isArray(v) ? `[${v.map(q).join(', ')}]` : typeof v === 'number' ? String(v) : q(v));
const text = `// The game list. MADE AUTOMATICALLY from the files in games/ — don’t edit it.
// To add a game, upload its file to games/. To change a game's name, blurb or
// search words, change them in that game's file (see ADDING-A-GAME.md).
// GitHub rebuilds this list every time you upload (.github/build-catalog.mjs).

export const CATALOG = [
${entries.map((e) => `  {\n${Object.entries(e).map(([k, v]) => `    ${k}: ${val(v)},`).join('\n')}\n  },`).join('\n')}
];
`;

await rm(scratch, { recursive: true, force: true });
const path = join(gamesDir, 'catalog.js');
const before = await readFile(path, 'utf8').catch(() => '');
warnings.forEach((w) => console.log('Note: ' + w));
if (before === text) {
  console.log(`Game list is up to date (${entries.length} games).`);
} else {
  await writeFile(path, text);
  const added = entries.filter((e) => !byFile.has(e.file)).map((e) => e.name);
  const gone = current.filter((e) => !entries.some((x) => x.file === e.file)).map((e) => e.name);
  console.log(`Game list updated: ${entries.length} games.` +
    (added.length ? ` Added: ${added.join(', ')}.` : '') + (gone.length ? ` Removed: ${gone.join(', ')}.` : ''));
}
