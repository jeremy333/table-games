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
    id: 'domination',
    file: 'domination.js',
    name: 'Domination',
    min: 2,
    max: 4,
    blurb: 'Build your deck from a shared supply: 26 kingdom cards, 10 per game.',
    tags: ['deck-building', 'dominion', 'strategy', 'cards', 'kingdom'],
  },
  {
    id: 'hearts', file: 'hearts.js', name: 'Hearts', min: 4, max: 4,
    blurb: 'Dodge hearts and the Queen of Spades, or take them all and shoot the moon.',
    tags: ['cards', 'trick-taking', 'passing', 'classic'],
  },
  {
    id: 'pinochle', file: 'pinochle.js', name: 'Pinochle', min: 4, max: 4,
    blurb: 'Partnership bidding, meld, and tricks with the 48-card deck.',
    tags: ['cards', 'trick-taking', 'bidding', 'partners', 'meld', 'teams'],
  },
  {
    id: 'go-fish', file: 'go-fish.js', name: 'Go Fish', min: 2, max: 6,
    blurb: 'Ask for cards, go fish, and collect books of four.',
    tags: ['cards', 'family', 'kids', 'easy'],
  },
  {
    id: 'checkers', file: 'checkers.js', name: 'Checkers', min: 2, max: 2,
    blurb: 'Jump, double-jump, and crown your kings.',
    tags: ['board', 'strategy', 'classic', 'two-player', 'draughts'],
  },
  {
    id: 'chess', file: 'chess.js', name: 'Chess', min: 2, max: 2,
    blurb: 'The full game: castling, en passant, promotion, and checkmate.',
    tags: ['board', 'strategy', 'classic', 'two-player'],
  },
  {
    id: 'mexican-train', file: 'mexican-train.js', name: 'Mexican Train', min: 2, max: 8,
    blurb: 'Dominoes for a crowd: build trains from the engine, cover doubles, go out first.',
    tags: ['dominoes', 'tiles', 'family', 'group'],
  },
  {
    id: 'farkle', file: 'farkle.js', name: 'Farkle', min: 2, max: 8,
    blurb: 'Roll six dice, bank points or push your luck — don’t Farkle!',
    tags: ['dice', 'party', 'luck', 'group'],
  },
  {
    id: 'yacht', file: 'yacht.js', name: 'Yacht', min: 1, max: 8,
    blurb: 'Five dice, three rolls, thirteen boxes to fill. Roll a Yacht for 50!',
    tags: ['dice', 'family', 'scorecard', 'yahtzee'],
  },
  {
    id: 'four-in-a-row', file: 'four-in-a-row.js', name: 'Four in a Row', min: 2, max: 2,
    blurb: 'Drop discs and line up four before your opponent does.',
    tags: ['board', 'two-player', 'quick', 'connect four', 'family'],
  },
  {
    id: 'mancala', file: 'mancala.js', name: 'Mancala', min: 2, max: 2,
    blurb: 'Sow seeds around the board, capture, and fill your store.',
    tags: ['board', 'two-player', 'strategy', 'kalah', 'classic'],
  },
  {
    id: 'challenge', file: 'challenge.js', name: 'Challenge', min: 2, max: 12,
    blurb: 'Play cards to claim spaces and make rows of five with your team.',
    tags: ['cards', 'board', 'teams', 'partners', 'sequence', 'group'],
  },
];
