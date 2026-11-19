// The list of games. To add a game: create games/your-game.js, import it here,
// add it to GAMES, and add its path to FILES in sw.js so it works offline.
import crazyEights from './crazy-eights.js';

export const GAMES = [crazyEights];

export function getGame(id) {
  return GAMES.find((g) => g.id === id);
}
