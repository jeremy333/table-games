// Compatibility file: older copies of the app (saved on some phones) load the
// game list from here. Newer copies use games/catalog.js instead. Keep this file
// so a phone that hasn't updated yet still starts; it can be ignored otherwise.
import rook from './rook.js';
import crazyEights from './crazy-eights.js';
import domination from './domination.js';

export const GAMES = [
  { ...rook, id: 'rook', name: 'Rook' },
  { ...crazyEights, id: 'crazy-eights', name: 'Crazy Eights' },
  { ...domination, id: 'domination', name: 'Domination' },
];

export function getGame(id) {
  return GAMES.find((g) => g.id === id);
}
