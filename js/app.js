import {
  SIZE, PREMIUM, VALUES, RACK_SIZE, idx, other, shuffle,
  newGame, evaluateMove, applyPlay, applyPass, applyExchange,
} from './rules.js';
import { createStore } from './store.js';
import { loadDictionary, unknownWords } from './dictionary.js';
import { CONFIG } from './config.js';

const PREMIUM_LABELS = { T: 'TW', D: 'DW', t: 'TL', d: 'DL', '*': '★' };
const PREMIUM_CLASSES = { T: 'tw', D: 'dw', t: 'tl', d: 'dl', '*': 'dw' };
const CONFIRM_MS = 3000;
const LOG_LENGTH = 10;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const gameId = params.get('g');
const seat = params.get('p') === '2' ? 2 : 1;
const store = createStore(CONFIG);

const ui = {
  game: null,          // { state, version }
  pending: [],         // tiles placed this turn: { r, c, l, b, rackIdx }
  selected: null,      // rack index picked up
  order: [],           // display order of the rack (shuffle is local only)
  orderKey: '',
  exchanging: false,
  swapPicks: new Set(),
  confirmPass: false,
  allowUnknown: false,
  busy: false,
  suppressClick: false,
};

// ---------- helpers ----------

const state = () => ui.game.state;
const myTurn = () => !state().over && state().turn === seat;
const nameOf = (s) => state().names[s] || `Player ${s}`;
const linkFor = (s) => `${location.origin}${location.pathname}?g=${gameId}&p=${s}`;

function tileHtml(letter, blank, extra = '') {
  const value = blank ? '' : VALUES[letter];
  return `<span class="tile ${blank ? 'blank' : ''} ${extra}"><span class="ltr">${letter === '?' ? '' : letter}</span><span class="val">${value || ''}</span></span>`;
}

function say(text, tone = '') {
  const msg = $('msg');
  msg.textContent = text;
  msg.dataset.tone = tone;
}

function syncOrder() {
  const rack = state().racks[seat];
  const key = rack.join('');
  if (key !== ui.orderKey) {
    ui.order = rack.map((_, i) => i);
    ui.orderKey = key;
  }
}

function resetTurn() {
  ui.pending = [];
  ui.selected = null;
  ui.exchanging = false;
  ui.swapPicks = new Set();
  ui.confirmPass = false;
  ui.allowUnknown = false;
}

// ---------- rendering ----------

function renderScores() {
  const s = state();
  [1, 2].forEach((p) => {
    const card = $(`player-${p}`);
    card.querySelector('.name').textContent = nameOf(p) + (p === seat ? ' (you)' : '');
    card.querySelector('.score').textContent = s.scores[p];
    card.classList.toggle('active', !s.over && s.turn === p);
  });
  $('bag-count').textContent = `${s.bag.length} tiles in the bag`;

  const banner = $('turn');
  if (s.over) {
    const [a, b] = [s.scores[1], s.scores[2]];
    banner.textContent = a === b ? 'Game over: a draw!' : `Game over: ${nameOf(a > b ? 1 : 2)} wins!`;
  } else {
    banner.textContent = myTurn() ? 'Your turn' : `Waiting for ${nameOf(s.turn)}…`;
  }
  banner.dataset.mine = String(myTurn());
  document.title = myTurn() ? '● Your turn · Tiles & Tea' : 'Tiles & Tea';
}

function renderBoard() {
  const s = state();
  const pendingAt = new Map(ui.pending.map((p) => [idx(p.r, p.c), p]));
  const last = new Set(s.lastMove);
  const cells = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const tile = s.board[i];
    const placed = pendingAt.get(i);
    const prem = PREMIUM[i];
    let inner = '';
    let cls = `cell ${PREMIUM_CLASSES[prem] || ''}`;
    if (tile) inner = tileHtml(tile.l, tile.b, last.has(i) ? 'recent' : '');
    else if (placed) { inner = tileHtml(placed.l, placed.b, 'pending'); cls += ' has-pending'; }
    else if (prem !== '.') inner = `<span class="prem">${PREMIUM_LABELS[prem]}</span>`;
    if (prem === '*') cls += ' centre';
    cells.push(`<button type="button" class="${cls}" data-i="${i}" aria-label="Row ${Math.floor(i / SIZE) + 1}, column ${(i % SIZE) + 1}">${inner}</button>`);
  }
  $('board').innerHTML = cells.join('');
}

function renderRack() {
  syncOrder();
  const rack = state().racks[seat];
  const used = new Set(ui.pending.map((p) => p.rackIdx));
  $('rack').innerHTML = ui.order.map((i, pos) => {
    if (used.has(i)) return `<span class="slot" data-pos="${pos}"></span>`;
    const picked = ui.exchanging ? ui.swapPicks.has(i) : ui.selected === i;
    return `<button type="button" class="rack-tile ${picked ? 'picked' : ''}" data-r="${i}" data-pos="${pos}" aria-pressed="${picked}">${tileHtml(rack[i], rack[i] === '?')}</button>`;
  }).join('');
}

function renderControls() {
  const turn = myTurn();
  const evaluation = ui.pending.length ? evaluateMove(state().board, ui.pending) : null;
  const play = $('play');
  play.disabled = !turn || ui.busy || !evaluation?.ok;
  play.textContent = evaluation?.ok ? `Play ${evaluation.words[0].word} for ${evaluation.score}` : 'Play';
  if (ui.allowUnknown) play.textContent = 'Play anyway';

  $('recall').disabled = !ui.pending.length;
  $('pass').disabled = !turn || ui.busy || ui.exchanging;
  $('pass').textContent = ui.confirmPass ? 'Tap again to pass' : 'Pass';
  $('swap').disabled = !turn || ui.busy || state().bag.length < RACK_SIZE || ui.pending.length > 0;
  $('swap').textContent = ui.exchanging ? 'Cancel swap' : 'Swap tiles';
  $('swap-go').hidden = !ui.exchanging;
  $('swap-go').disabled = ui.swapPicks.size === 0 || ui.busy;
  $('swap-go').textContent = `Swap ${ui.swapPicks.size} tile${ui.swapPicks.size === 1 ? '' : 's'}`;
  $('play').hidden = ui.exchanging;

  if (evaluation && !evaluation.ok) say(evaluation.error, 'warn');
}

function describe(entry) {
  const who = nameOf(entry.seat);
  if (entry.type === 'play') {
    return `${who} played ${entry.words.join(', ')} for ${entry.score}${entry.bingo ? ' (all 7 tiles!)' : ''}`;
  }
  if (entry.type === 'exchange') return `${who} swapped ${entry.count} tile${entry.count === 1 ? '' : 's'}`;
  if (entry.type === 'pass') return `${who} passed`;
  return entry.seat ? `${who} used every tile. Game over.` : 'Six turns in a row with no score. Game over.';
}

function renderLog() {
  const items = state().log.slice(-LOG_LENGTH).reverse();
  const list = $('log');
  list.replaceChildren(...items.map((entry) => {
    const li = document.createElement('li');
    li.textContent = describe(entry);
    return li;
  }));
  $('log-empty').hidden = items.length > 0;
}

function renderInvite() {
  const opponent = other(seat);
  $('invite-name').textContent = nameOf(opponent);
  $('invite-link').value = linkFor(opponent);
  $('own-link').value = linkFor(seat);
  if (params.get('new') === '1') $('invite').open = true;
}

function render() {
  renderScores();
  renderBoard();
  renderRack();
  renderControls();
  renderLog();
}

// ---------- actions ----------

async function commit(nextState, doneText) {
  ui.busy = true;
  renderControls();
  try {
    const result = await store.save(gameId, nextState, ui.game.version);
    if (!result.ok) {
      ui.game = await store.load(gameId);
      resetTurn();
      say('The game changed on another screen. Here is the latest board.', 'warn');
    } else {
      ui.game = { state: nextState, version: result.version };
      resetTurn();
      say(doneText, 'good');
    }
  } catch (err) {
    say(`Couldn't save your move: ${err.message}. Check your connection and try again.`, 'warn');
  } finally {
    ui.busy = false;
    render();
  }
}

async function play() {
  const evaluation = evaluateMove(state().board, ui.pending);
  if (!evaluation.ok) return say(evaluation.error, 'warn');
  const unknown = unknownWords(evaluation.words.map((w) => w.word));
  if (unknown.length && !ui.allowUnknown) {
    ui.allowUnknown = true;
    renderControls();
    return say(`${unknown.join(', ')} isn't in the word list. Agree it together, then tap "Play anyway" or recall your tiles.`, 'warn');
  }
  const next = applyPlay(state(), seat, ui.pending, evaluation);
  await commit(next, `You scored ${evaluation.score}.`);
}

async function swap() {
  const rack = state().racks[seat];
  const letters = [...ui.swapPicks].map((i) => rack[i]);
  await commit(applyExchange(state(), seat, letters), `Swapped ${letters.length} tiles.`);
}

async function pass() {
  if (!ui.confirmPass) {
    ui.confirmPass = true;
    renderControls();
    setTimeout(() => { ui.confirmPass = false; renderControls(); }, CONFIRM_MS);
    return;
  }
  await commit(applyPass(state(), seat), 'You passed.');
}

function chooseBlankLetter() {
  return new Promise((resolve) => {
    const picker = $('picker');
    const grid = $('picker-grid');
    grid.innerHTML = LETTERS.map((l) => `<button type="button" data-l="${l}">${l}</button>`).join('');
    const close = (letter) => {
      picker.hidden = true;
      grid.onclick = null;
      $('picker-cancel').onclick = null;
      resolve(letter);
    };
    grid.onclick = (e) => { const b = e.target.closest('button'); if (b) close(b.dataset.l); };
    $('picker-cancel').onclick = () => close(null);
    picker.hidden = false;
    grid.querySelector('button').focus();
  });
}

const pendingAt = (i) => ui.pending.find((p) => idx(p.r, p.c) === i);
const isFree = (i) => state().board[i] === null && !pendingAt(i);

function afterTileMove() {
  ui.allowUnknown = false;
  say('');
  render();
}

async function placeFromRack(rackIdx, i) {
  const letter = state().racks[seat][rackIdx];
  const blank = letter === '?';
  const chosen = blank ? await chooseBlankLetter() : letter;
  if (!chosen || !isFree(i)) return;
  const r = Math.floor(i / SIZE);
  ui.pending = [...ui.pending, { r, c: i % SIZE, l: chosen, b: blank, rackIdx }];
  ui.selected = null;
  afterTileMove();
}

async function onBoardTap(event) {
  const cell = event.target.closest('.cell');
  if (ui.suppressClick || !cell || !myTurn() || ui.busy || ui.exchanging) return;
  const i = Number(cell.dataset.i);
  const existing = pendingAt(i);
  if (existing) {
    ui.pending = ui.pending.filter((p) => p !== existing);
    afterTileMove();
  } else if (ui.selected !== null && isFree(i)) {
    await placeFromRack(ui.selected, i);
  }
}

// ---------- dragging (mouse and touch, via pointer events) ----------

const DRAG_THRESHOLD_PX = 6;
let drag = null; // { source, startX, startY, ghost, target, el, pointerId }

function dragSourceFrom(target) {
  if (!myTurn() || ui.busy || ui.exchanging) return null;
  const rackTile = target.closest('.rack-tile');
  if (rackTile) return { kind: 'rack', rackIdx: Number(rackTile.dataset.r), el: rackTile };
  const cell = target.closest('.cell.has-pending');
  if (cell) return { kind: 'pending', placed: pendingAt(Number(cell.dataset.i)), el: cell };
  return null;
}

function startGhost(source, x, y) {
  const rect = source.el.getBoundingClientRect();
  const letter = source.kind === 'rack' ? state().racks[seat][source.rackIdx] : source.placed.l;
  const blank = source.kind === 'rack' ? letter === '?' : source.placed.b;
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.style.width = `${Math.max(rect.width, 44)}px`;
  ghost.innerHTML = tileHtml(letter, blank);
  document.body.append(ghost);
  source.el.classList.add('dragging');
  moveGhost(ghost, x, y);
  return ghost;
}

function moveGhost(ghost, x, y) {
  ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -60%)`;
}

function dropTargetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cell = el.closest('.cell');
  if (cell) return { kind: 'cell', i: Number(cell.dataset.i), el: cell };
  const spot = el.closest('[data-pos]');
  if (spot) return { kind: 'rack', pos: Number(spot.dataset.pos), el: spot };
  if (el.closest('#rack')) return { kind: 'rack', pos: null, el: $('rack') };
  return null;
}

function onPointerDown(event) {
  if (event.button !== 0 || drag) return;
  const source = dragSourceFrom(event.target);
  if (!source) return;
  drag = { source, startX: event.clientX, startY: event.clientY, ghost: null, target: null, pointerId: event.pointerId };
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const { clientX: x, clientY: y } = event;
  if (!drag.ghost) {
    if (Math.hypot(x - drag.startX, y - drag.startY) < DRAG_THRESHOLD_PX) return;
    drag.ghost = startGhost(drag.source, x, y);
  }
  event.preventDefault();
  moveGhost(drag.ghost, x, y);
  const target = dropTargetAt(x, y);
  drag.target?.el.classList.remove('drop-target');
  const usable = target && (target.kind === 'rack' || isFree(target.i));
  drag.target = usable ? target : null;
  drag.target?.el.classList.add('drop-target');
}

function endDrag() {
  if (!drag) return;
  drag.ghost?.remove();
  drag.source.el.classList.remove('dragging');
  drag.target?.el.classList.remove('drop-target');
  drag = null;
}

function reorderRack(rackIdx, pos) {
  const without = ui.order.filter((i) => i !== rackIdx);
  const at = pos === null ? without.length : Math.min(pos, without.length);
  ui.order = [...without.slice(0, at), rackIdx, ...without.slice(at)];
}

async function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const { source, target, ghost } = drag;
  endDrag();
  if (!ghost) return; // a plain tap: the click handlers take it from here

  // Swallow the click the browser fires after a drag ends.
  ui.suppressClick = true;
  setTimeout(() => { ui.suppressClick = false; }, 0);
  if (!target) return;

  if (source.kind === 'rack' && target.kind === 'cell') {
    await placeFromRack(source.rackIdx, target.i);
  } else if (source.kind === 'rack') {
    reorderRack(source.rackIdx, target.pos);
    renderRack();
  } else if (target.kind === 'cell') {
    const r = Math.floor(target.i / SIZE);
    ui.pending = ui.pending.map((p) => (p === source.placed ? { ...p, r, c: target.i % SIZE } : p));
    afterTileMove();
  } else {
    ui.pending = ui.pending.filter((p) => p !== source.placed);
    afterTileMove();
  }
}

function onRackTap(event) {
  const btn = event.target.closest('.rack-tile');
  if (ui.suppressClick || !btn || !myTurn()) return;
  const i = Number(btn.dataset.r);
  if (ui.exchanging) {
    const picks = new Set(ui.swapPicks);
    if (picks.has(i)) picks.delete(i); else picks.add(i);
    ui.swapPicks = picks;
  } else {
    ui.selected = ui.selected === i ? null : i;
    if (ui.selected !== null) say('Now tap a square on the board.');
  }
  renderRack();
  renderControls();
}

async function copyField(fieldId, button) {
  const field = $(fieldId);
  try {
    await navigator.clipboard.writeText(field.value);
    button.textContent = 'Copied';
  } catch {
    field.select();
    button.textContent = 'Press Ctrl+C';
  }
  setTimeout(() => { button.textContent = 'Copy'; }, CONFIRM_MS);
}

function wireGame() {
  $('board').addEventListener('click', onBoardTap);
  $('rack').addEventListener('click', onRackTap);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', endDrag);
  $('play').addEventListener('click', play);
  $('recall').addEventListener('click', () => { ui.pending = []; ui.allowUnknown = false; say(''); render(); });
  $('shuffle').addEventListener('click', () => { ui.order = shuffle(ui.order); renderRack(); });
  $('pass').addEventListener('click', pass);
  $('swap').addEventListener('click', () => {
    ui.exchanging = !ui.exchanging;
    ui.swapPicks = new Set();
    ui.selected = null;
    say(ui.exchanging ? 'Tap the tiles you want to swap.' : '');
    renderRack();
    renderControls();
  });
  $('swap-go').addEventListener('click', swap);
  $('copy-invite').addEventListener('click', (e) => copyField('invite-link', e.currentTarget));
  $('copy-own').addEventListener('click', (e) => copyField('own-link', e.currentTarget));
}

function receive(incoming) {
  if (!incoming || incoming.version <= ui.game.version) return;
  const wasMyTurn = myTurn();
  ui.game = incoming;
  if (wasMyTurn !== myTurn() || !myTurn()) resetTurn();
  if (myTurn() && !wasMyTurn) say(`${nameOf(other(seat))} has played. Your turn!`, 'good');
  render();
}

async function refresh() {
  try { receive(await store.load(gameId)); } catch { /* the live feed or next refresh will catch up */ }
}

// ---------- start ----------

async function startGame() {
  $('game').hidden = false;
  try {
    ui.game = await store.load(gameId);
  } catch (err) {
    $('game').hidden = true;
    $('error').hidden = false;
    $('error-text').textContent = `Couldn't reach the game server: ${err.message}`;
    return;
  }
  if (!ui.game) {
    $('game').hidden = true;
    $('error').hidden = false;
    $('error-text').textContent = 'This game link doesn\'t match any game. Check the link, or start a new game.';
    return;
  }
  wireGame();
  renderInvite();
  render();
  store.subscribe(gameId, receive);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  loadDictionary();
}

function startSetup() {
  $('setup').hidden = false;
  $('setup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const me = $('name-me').value.trim().slice(0, 24) || 'Player 1';
    const them = $('name-them').value.trim().slice(0, 24) || 'Player 2';
    const button = $('setup-go');
    button.disabled = true;
    button.textContent = 'Setting up the board…';
    try {
      const id = await store.create(newGame({ 1: me, 2: them }));
      location.href = `${location.pathname}?g=${id}&p=1&new=1`;
    } catch (err) {
      button.disabled = false;
      button.textContent = 'Start the game';
      $('setup-error').textContent = `Couldn't create the game: ${err.message}`;
    }
  });
}

$('mode').hidden = store.online;
if (gameId) startGame(); else startSetup();
