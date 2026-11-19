// The game catalog. Adding a game = put its file in games/ and add one entry here.
// Nothing else in the app needs to change.
//
//   id       unique, no spaces (must match the game file's id)
//   file     the game's file in this folder
//   name     shown in the game list
//   min/max  player counts (used for search, e.g. "4" finds 4-player games)
//   blurb    one line shown under the name
//   tags     extra search words
//   assets   (optional) other files the game needs, e.g. images, so they download too

export const CATALOG = [
  {
    id: 'rook',
    file: 'rook.js',
    name: 'Rook',
    min: 4,
    max: 4,
    blurb: 'Bid, take the nest, and win tricks with set or picked partners.',
    tags: ['cards', 'trick-taking', 'bidding', 'partners', 'teams', 'moon'],
  },
  {
    id: 'crazy-eights',
    file: 'crazy-eights.js',
    name: 'Crazy Eights',
    min: 2,
    max: 7,
    blurb: 'Match suit or rank; eights are wild. First to empty their hand wins.',
    tags: ['cards', 'shedding', 'family', 'quick', 'easy'],
  },
  {
    id: 'homestead',
    file: 'homestead.js',
    name: 'Homestead',
    min: 2,
    max: 4,
    blurb: 'Build your deck from a shared supply in this Dominion-style game.',
    tags: ['deck-building', 'dominion', 'strategy', 'cards'],
  },
];
