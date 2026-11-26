// "Tiles left": letters this player hasn't seen yet, in the bag or on the other player's rack.
import { unseenTiles } from './rules.js';

const ORDER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ?'.split('');

export function renderTilesLeft({ state, seat, opponentName, $ }) {
  const left = unseenTiles(state, seat);
  const total = ORDER.reduce((sum, l) => sum + left[l], 0);
  $('unseen-count').textContent = `(${total})`;
  $('unseen-note').textContent = state.over
    ? 'The game is over.'
    : `Still in the bag or on ${opponentName}'s rack. Greyed-out letters are all used up.`;
  $('unseen-grid').replaceChildren(...ORDER.map((l) => {
    const item = document.createElement('span');
    item.className = `unseen${left[l] === 0 ? ' gone' : ''}`;
    item.setAttribute('aria-label', `${l === '?' ? 'Blank' : l}: ${left[l]} left`);
    const letter = document.createElement('span');
    letter.className = 'u-ltr';
    letter.textContent = l === '?' ? '★' : l;
    const count = document.createElement('span');
    count.className = 'u-n';
    count.textContent = left[l];
    item.append(letter, count);
    return item;
  }));
}
