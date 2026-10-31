// Finds the highest-scoring move for a rack. Pure: give it a board, a rack and a word checker.
// dict: { isWord(word), hasPrefix(prefix) } with upper-case words.

import { SIZE, CENTER, idx, evaluateMove } from './rules.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function anchorsFor(board) {
  if (board.every((t) => t === null)) return new Set([CENTER]);
  const anchors = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[idx(r, c)] !== null) continue;
      const touches = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => {
        const rr = r + a;
        const cc = c + b;
        return rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[idx(rr, cc)] !== null;
      });
      if (touches) anchors.add(idx(r, c));
    }
  }
  return anchors;
}

export function findBestMove(board, rack, dict, deadline = Infinity) {
  const anchors = anchorsFor(board);
  const crossMemo = new Map();
  let best = null;
  let outOfTime = false;

  for (const horizontal of [true, false]) {
    // `line` is the row (horizontal) or column (vertical); `pos` runs along it.
    const cellAt = (line, pos) => (horizontal ? idx(line, pos) : idx(pos, line));
    const [stepR, stepC] = horizontal ? [1, 0] : [0, 1]; // perpendicular step, for cross words

    const crossOk = (cell, letter) => {
      const key = `${horizontal}${cell}${letter}`;
      if (crossMemo.has(key)) return crossMemo.get(key);
      const r0 = Math.floor(cell / SIZE);
      const c0 = cell % SIZE;
      const lettersFrom = (dir) => {
        let out = '';
        for (let r = r0 + dir * stepR, c = c0 + dir * stepC;
          r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[idx(r, c)] !== null;
          r += dir * stepR, c += dir * stepC) {
          out = dir < 0 ? board[idx(r, c)].l + out : out + board[idx(r, c)].l;
        }
        return out;
      };
      const before = lettersFrom(-1);
      const after = lettersFrom(1);
      const ok = !before && !after ? true : dict.isWord(before + letter + after);
      crossMemo.set(key, ok);
      return ok;
    };

    const record = (placed) => {
      const placements = placed.map(({ cell, l, b }) => ({ r: Math.floor(cell / SIZE), c: cell % SIZE, l, b }));
      const evaluation = evaluateMove(board, placements);
      if (evaluation.ok && (!best || evaluation.score > best.score)) {
        best = { placements, score: evaluation.score, words: evaluation.words.map((w) => w.word) };
      }
    };

    const extend = (line, pos, prefix, rackLeft, placed, connected) => {
      if (outOfTime) return;
      if (pos < SIZE && board[cellAt(line, pos)] !== null) {
        const next = prefix + board[cellAt(line, pos)].l;
        if (dict.hasPrefix(next)) extend(line, pos + 1, next, rackLeft, placed, true);
        return;
      }
      if (placed.length && connected && prefix.length > 1 && dict.isWord(prefix)) record(placed);
      if (pos >= SIZE || rackLeft.length === 0) return;
      if (Date.now() > deadline) { outOfTime = true; return; }

      const cell = cellAt(line, pos);
      const tried = new Set();
      rackLeft.forEach((tile, i) => {
        if (tried.has(tile)) return;
        tried.add(tile);
        const rest = [...rackLeft.slice(0, i), ...rackLeft.slice(i + 1)];
        for (const letter of tile === '?' ? ALPHABET : tile) {
          const next = prefix + letter;
          if (!dict.hasPrefix(next) || !crossOk(cell, letter)) continue;
          extend(line, pos + 1, next, rest, [...placed, { cell, l: letter, b: tile === '?' }], connected || anchors.has(cell));
        }
      });
    };

    // A start can only lead to a legal move if an anchor is reachable with the tiles in hand.
    const reachable = (line, start) => {
      let empties = 0;
      for (let pos = start; pos < SIZE; pos++) {
        const cell = cellAt(line, pos);
        if (board[cell] !== null || anchors.has(cell)) return true;
        empties += 1;
        if (empties >= rack.length) return false;
      }
      return false;
    };

    for (let line = 0; line < SIZE; line++) {
      for (let start = 0; start < SIZE; start++) {
        if (start > 0 && board[cellAt(line, start - 1)] !== null) continue;
        if (!reachable(line, start)) continue;
        extend(line, start, '', rack, [], false);
        if (outOfTime) return best;
      }
    }
  }
  return best;
}
