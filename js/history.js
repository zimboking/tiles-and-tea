// Match history across rematches: the win tally and a list of past scores.
// Each rematch carries `history` (finished games, oldest first) into the new game's state.
import { historyEntry, tally, winnerOf, bestPlays } from './rules.js';

const MAX_LOOKBACK = 200;
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

// Games finished so far in this match, including this one if it has ended.
export function finishedGames(state, gameId) {
  const past = state.history ?? [];
  return state.over ? [...past, historyEntry(gameId, state, null)] : past;
}

// History to hand to the rematch. Games from before history was kept are found
// by following the rematch links backwards.
export async function historyForRematch(store, gameId, finished) {
  const endedNow = historyEntry(gameId, finished, new Date().toISOString());
  if (finished.history) return [...finished.history, endedNow];

  const found = [];
  let base = [];
  let id = gameId;
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    const prev = await store.findPrevious(id).catch(() => null);
    if (!prev?.state?.over) break;
    found.unshift(historyEntry(prev.id, prev.state, prev.endedAt));
    if (prev.state.history) { base = prev.state.history; break; }
    id = prev.id;
  }
  return [...base, ...found, endedNow];
}

function seriesLine(t, nameOf) {
  const draws = t.draws ? `, ${t.draws} drawn` : '';
  if (t[1] === t[2]) return `Wins: level at ${t[1]} each${draws}`;
  const lead = t[1] > t[2] ? 1 : 2;
  const trail = lead === 1 ? 2 : 1;
  return `Wins: ${nameOf(lead)} leads ${t[lead]} to ${t[trail]}${draws}`;
}

function historyRow(game, number, nameOf) {
  const li = document.createElement('li');
  const w = winnerOf(game.scores);
  const label = document.createElement('span');
  label.className = 'game-no';
  label.textContent = `Game ${number}`;
  const result = document.createElement('span');
  [1, 2].forEach((p) => {
    const part = document.createElement('span');
    part.className = w === p ? 'won' : '';
    part.textContent = `${nameOf(p)} ${game.scores[p]}`;
    result.append(part);
    if (p === 1) result.append(' · ');
  });
  li.append(label, result);
  if (w === 0) li.append(' (draw)');
  if (game.endedAt) {
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = DATE.format(new Date(game.endedAt));
    li.append(when);
  }
  return li;
}

// Highest-scoring move and highest game score per seat, across the whole match so far.
export function personalBests(state, games) {
  const result = { 1: { move: null, game: null }, 2: { move: null, game: null } };
  const moveSources = [...games.map((g) => g.best ?? {}), state.over ? {} : bestPlays(state.log)];
  [1, 2].forEach((p) => {
    moveSources.forEach((best) => {
      if (best[p] && best[p].score > (result[p].move?.score ?? -1)) result[p].move = best[p];
    });
    games.forEach((g) => {
      if (g.scores[p] > (result[p].game ?? -Infinity)) result[p].game = g.scores[p];
    });
  });
  return result;
}

function renderBests(bests, nameOf, $) {
  const rows = [1, 2].filter((p) => bests[p].move || bests[p].game !== null).map((p) => {
    const row = document.createElement('p');
    const who = document.createElement('strong');
    who.textContent = `${nameOf(p)}: `;
    const parts = [];
    if (bests[p].move) parts.push(`best move ${bests[p].move.words[0]} for ${bests[p].move.score}`);
    if (bests[p].game !== null) parts.push(`best game ${bests[p].game}`);
    row.append(who, parts.join(' · '));
    return row;
  });
  if (rows.length) {
    const title = document.createElement('h3');
    title.textContent = 'Personal bests';
    rows.unshift(title);
  }
  $('bests').replaceChildren(...rows);
  return rows.length > 0;
}

export function renderHistory({ state, gameId, nameOf, $ }) {
  const games = finishedGames(state, gameId);
  const t = tally(games);
  [1, 2].forEach((p) => {
    const wins = $(`player-${p}`).querySelector('.wins');
    wins.hidden = games.length === 0;
    wins.textContent = `${t[p]} ${t[p] === 1 ? 'win' : 'wins'}`;
  });

  const showSeries = state.over && games.length > 1;
  $('series').hidden = !showSeries;
  if (showSeries) $('series').textContent = seriesLine(t, nameOf);

  const hasBests = renderBests(personalBests(state, games), nameOf, $);
  $('history').hidden = games.length === 0 && !hasBests;
  $('history-summary').hidden = games.length === 0;
  $('history-list').hidden = games.length === 0;
  if (games.length === 0) return;
  $('history-summary').textContent = `${seriesLine(t, nameOf)} after ${games.length} ${games.length === 1 ? 'game' : 'games'}.`;
  $('history-list').replaceChildren(...games.map((g, i) => historyRow(g, i + 1, nameOf)).reverse());
}
