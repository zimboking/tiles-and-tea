// Pure game rules: no DOM, no network. Every function returns new objects.

export const SIZE = 15;
export const RACK_SIZE = 7;
const BINGO_BONUS = 50;
const MAX_SCORELESS_TURNS = 6;

// T = triple word, D = double word, t = triple letter, d = double letter, * = centre.
const TOP_HALF = [
  'T..d...T...d..T',
  '.D...t...t...D.',
  '..D...d.d...D..',
  'd..D...d...D..d',
  '....D.....D....',
  '.t...t...t...t.',
  '..d...d.d...d..',
  'T..d...*...d..T',
];
export const PREMIUM = TOP_HALF.concat(TOP_HALF.slice(0, 7).reverse()).join('').split('');
export const CENTER = 7 * SIZE + 7;

export const VALUES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10, '?': 0,
};
const COUNTS = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1, '?': 2,
};

export const idx = (r, c) => r * SIZE + c;
export const other = (seat) => (seat === 1 ? 2 : 1);

export function shuffle(items, rand = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function draw(bag, rack) {
  const need = Math.max(0, RACK_SIZE - rack.length);
  return { bag: bag.slice(need), rack: rack.concat(bag.slice(0, need)) };
}

function removeTiles(rack, letters) {
  const left = rack.slice();
  letters.forEach((letter) => {
    const at = left.indexOf(letter);
    if (at === -1) throw new Error(`Tile ${letter} is not on the rack.`);
    left.splice(at, 1);
  });
  return left;
}

export const rackValue = (rack) => rack.reduce((sum, l) => sum + VALUES[l], 0);

export function newGame(names, rand = Math.random) {
  const fullBag = shuffle(Object.entries(COUNTS).flatMap(([l, n]) => Array(n).fill(l)), rand);
  const first = draw(fullBag, []);
  const second = draw(first.bag, []);
  return {
    board: Array(SIZE * SIZE).fill(null),
    bag: second.bag,
    racks: { 1: first.rack, 2: second.rack },
    scores: { 1: 0, 2: 0 },
    names: { 1: names[1], 2: names[2] },
    turn: 1,
    passes: 0,
    lastMove: [],
    log: [],
    over: false,
  };
}

const filled = (board, r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[idx(r, c)] !== null;

// Cells of the run of tiles through (r, c) along direction (dr, dc).
function runThrough(board, r, c, dr, dc) {
  let sr = r;
  let sc = c;
  while (filled(board, sr - dr, sc - dc)) { sr -= dr; sc -= dc; }
  const cells = [];
  for (let cr = sr, cc = sc; filled(board, cr, cc); cr += dr, cc += dc) cells.push([cr, cc]);
  return cells;
}

function scoreRun(board, cells, newCells) {
  let sum = 0;
  let wordMult = 1;
  cells.forEach(([r, c]) => {
    const i = idx(r, c);
    const tile = board[i];
    let value = tile.b ? 0 : VALUES[tile.l];
    if (newCells.has(i)) {
      const p = PREMIUM[i];
      if (p === 'd') value *= 2;
      if (p === 't') value *= 3;
      if (p === 'D' || p === '*') wordMult *= 2;
      if (p === 'T') wordMult *= 3;
    }
    sum += value;
  });
  return { word: cells.map(([r, c]) => board[idx(r, c)].l).join(''), score: sum * wordMult };
}

const fail = (error) => ({ ok: false, error });

// placements: [{ r, c, l, b }] where b marks a blank tile.
export function evaluateMove(board, placements) {
  if (placements.length === 0) return fail('Place at least one tile.');
  if (placements.some((p) => board[idx(p.r, p.c)] !== null)) return fail('That square is already taken.');

  const rows = new Set(placements.map((p) => p.r));
  const cols = new Set(placements.map((p) => p.c));
  if (rows.size > 1 && cols.size > 1) return fail('Tiles must go in one straight line.');

  const next = board.slice();
  placements.forEach((p) => { next[idx(p.r, p.c)] = { l: p.l, b: p.b }; });
  const newCells = new Set(placements.map((p) => idx(p.r, p.c)));
  const first = placements[0];

  let horizontal = rows.size === 1;
  if (placements.length === 1) {
    horizontal = filled(board, first.r, first.c - 1) || filled(board, first.r, first.c + 1);
  }
  const [dr, dc] = horizontal ? [0, 1] : [1, 0];

  const main = runThrough(next, first.r, first.c, dr, dc);
  const mainSet = new Set(main.map(([r, c]) => idx(r, c)));
  if (placements.some((p) => !mainSet.has(idx(p.r, p.c)))) return fail('Tiles must touch, with no gaps.');

  const isFirstMove = board.every((t) => t === null);
  if (isFirstMove && !newCells.has(CENTER)) return fail('The first word must cover the centre star.');
  if (!isFirstMove) {
    const touches = placements.some((p) =>
      [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => filled(board, p.r + a, p.c + b)));
    if (!touches) return fail('New words must join tiles already on the board.');
  }

  const runs = [];
  if (main.length > 1) runs.push(main);
  placements.forEach((p) => {
    const cross = runThrough(next, p.r, p.c, dc, dr);
    if (cross.length > 1) runs.push(cross);
  });
  if (runs.length === 0) return fail('Words need at least two letters.');

  const words = runs.map((cells) => scoreRun(next, cells, newCells));
  const bingo = placements.length === RACK_SIZE;
  const score = words.reduce((s, w) => s + w.score, 0) + (bingo ? BINGO_BONUS : 0);
  return { ok: true, words, score, bingo };
}

function finish(state, outSeat) {
  const scores = { ...state.scores };
  const leftover = { 1: rackValue(state.racks[1]), 2: rackValue(state.racks[2]) };
  if (outSeat) {
    const loser = other(outSeat);
    scores[outSeat] += leftover[loser];
    scores[loser] -= leftover[loser];
  } else {
    scores[1] -= leftover[1];
    scores[2] -= leftover[2];
  }
  return { ...state, scores, over: true, log: [...state.log, { type: 'end', seat: outSeat || null }] };
}

function endScorelessTurn(state, seat, entry) {
  const next = { ...state, turn: other(seat), passes: state.passes + 1, lastMove: [], log: [...state.log, entry] };
  return next.passes >= MAX_SCORELESS_TURNS ? finish(next, null) : next;
}

export function applyPlay(state, seat, placements, evaluation) {
  const board = state.board.slice();
  placements.forEach((p) => { board[idx(p.r, p.c)] = { l: p.l, b: p.b }; });
  const kept = removeTiles(state.racks[seat], placements.map((p) => (p.b ? '?' : p.l)));
  const { bag, rack } = draw(state.bag, kept);
  const next = {
    ...state,
    board,
    bag,
    racks: { ...state.racks, [seat]: rack },
    scores: { ...state.scores, [seat]: state.scores[seat] + evaluation.score },
    turn: other(seat),
    passes: 0,
    lastMove: placements.map((p) => idx(p.r, p.c)),
    log: [...state.log, {
      type: 'play', seat, score: evaluation.score, bingo: evaluation.bingo,
      words: evaluation.words.map((w) => w.word),
    }],
  };
  return rack.length === 0 && bag.length === 0 ? finish(next, seat) : next;
}

export function applyExchange(state, seat, letters, rand = Math.random) {
  if (state.bag.length < RACK_SIZE) throw new Error('Swapping needs at least 7 tiles in the bag.');
  const kept = removeTiles(state.racks[seat], letters);
  const { bag, rack } = draw(state.bag, kept);
  const withSwapped = { ...state, bag: shuffle(bag.concat(letters), rand), racks: { ...state.racks, [seat]: rack } };
  return endScorelessTurn(withSwapped, seat, { type: 'exchange', seat, count: letters.length });
}

export function applyPass(state, seat) {
  return endScorelessTurn(state, seat, { type: 'pass', seat });
}
