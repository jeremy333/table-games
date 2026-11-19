# Adding a game

Each game is **one file** in `games/` plus **one entry** in `games/catalog.js`. Nothing else in the app changes: the lobby search, offline downloads, and sending the game to players' phones all pick it up automatically.

## Steps

1. Copy `games/template.js` to `games/your-game.js` and fill it in (or copy a finished game like `crazy-eights.js`).
2. Add an entry to `games/catalog.js`:
   ```js
   {
     id: 'your-game',        // unique, no spaces
     file: 'your-game.js',
     name: 'Your Game',
     min: 2, max: 4,         // player counts
     blurb: 'One line shown in the game list.',
     tags: ['cards', 'family'], // extra search words
   },
   ```
3. Test on your computer (below), then upload both files to GitHub.

That's it. No version numbers to bump, no other files to edit. Players get the new game the next time they open the site online, and the host's phone can send it to anyone who doesn't have it, even offline.

## What a game file provides

```js
export default {
  minPlayers: 2,
  maxPlayers: 4,
  rules: 'One or two sentences shown in the lobby.', // or rules(options) { return '...' }
  options: [ ... ],          // optional table settings (see below)
  styles: `...css...`,       // optional styles used only by this game

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
- **Pictures or sounds:** list them in the catalog entry as `assets: ['your-game/board.png']` so they download with the game.

## Table settings (optional)

Each entry becomes a field in the lobby; the host's picks are remembered and passed to `setup` and `rules`:

```js
options: [
  { id: 'partners', label: 'Partners', type: 'select', default: 'set',
    choices: [['set', 'Set partners'], ['pick', 'Pick partner']] },
  { id: 'playTo', label: 'Play to', type: 'number', default: 1000, min: 100, max: 10000, step: 50 },
],
```

Select values arrive as strings, so check them in `setup`. See `games/rook.js` for a full example.

## Testing on your computer

Run a local server in the project folder:

```
python3 -m http.server 8000
```

Open http://localhost:8000 in one browser window as the host and a private/incognito window as a player.
