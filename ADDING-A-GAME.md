# Adding a game

Each game is **one file** in `games/`. To add a game, upload its file to the `games` folder on GitHub. That's all.

GitHub rebuilds the game list (`games/catalog.js`) by itself a minute after every upload, using the name, blurb and search words in the game file. Don't edit `catalog.js` by hand; it's rewritten each time. The lobby search, offline downloads, the host app, and sending the game to players' phones all pick the new game up automatically.

## Steps

1. Copy `games/template.js` to `games/your-game.js` and fill it in (or copy a finished game like `crazy-eights.js`). The file name becomes the game's id, so use lowercase and dashes.
2. At the top of the game's `export default { ... }`, fill in how it shows in the game list:
   ```js
   name: 'Your Game',
   blurb: 'One line shown in the game list.',
   tags: ['cards', 'family'],   // extra search words
   minPlayers: 2,
   maxPlayers: 4,
   ```
3. Test on your computer (below), then upload the file to the `games` folder on GitHub.

That's it. No version numbers to bump, no other files to edit. To remove a game, delete its file. You can check that the list updated under the **Actions** tab, where the "Update the game list" step says which games were added.

## What a game file provides

```js
export default {
  name: 'Your Game',         // how it shows in the game list
  blurb: 'One line shown under the name.',
  tags: ['cards', 'family'], // extra search words
  minPlayers: 2,
  maxPlayers: 4,
  rules: 'One or two sentences shown in the lobby.', // or rules(options) { return '...' }
  options: [ ... ],          // optional table settings (see below)
  styles: `...css...`,       // optional styles used only by this game
  teams: true,               // optional: partners sit across (seats 1 & 3 vs 2 & 4), and the
                             // host picks partners in the lobby. Can be teams(options) { ... }

  setup(names, options) { ... },        // host only: return the full game state
  viewFor(state, seat) { ... },         // host only: what player `seat` may see
  applyMove(state, seat, move) { ... }, // host only: change state, return an error string or null
  render(view, root, send) { ... },     // every phone: draw `view` into `root`; call send(move) to act
};
```

Rules for a smooth game:

- **State and views must be plain data** (strings, numbers, arrays, objects), since they travel between phones.
- **Never put secret info in a view.** Send other players' card counts, not their cards.
- **Check everything in `applyMove`.** Is it this player's turn, do they hold that card, is the move legal? The returned message is shown to the player.
- Seat `0` is the host. Seats follow the lobby order.
- When the game ends, set `winner` in the view (anything but `null`). The host then gets a **Play again** button.
- **Imports:** a game may import shared code from `../js/` (like `../js/cards.js`, which has a standard deck, `shuffle`, and card drawing). Don't import other game files; copy what you need instead. This keeps each game self-contained so it can be sent to other phones.
- **Styles:** put game-only CSS in `styles` and start class names with the game's name (e.g. `.rook-card`) so games never clash.
- **Pictures or sounds:** list them in the game file as `assets: ['your-game/board.png']` so they download with the game.

## Table settings (optional)

Each entry becomes a field in the lobby; the host's picks are remembered and passed to `setup` and `rules`:

```js
options: [
  { id: 'partners', label: 'Partners', type: 'select', default: 'set',
    choices: [['set', 'Set partners'], ['pick', 'Pick partner']] },
  { id: 'playTo', label: 'Play to', type: 'number', default: 1000, min: 100, max: 10000, step: 50 },
],
```

Select values arrive as strings, so check them in `setup`. See `games/birds-nest.js` for a full example.

## Testing on your computer

Run a local server in the project folder:

```
python3 -m http.server 8000
```

Open http://localhost:8000 in one browser window as the host and a private/incognito window as a player.
