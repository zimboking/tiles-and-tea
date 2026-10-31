// Asks the background solver for the best move available with a rack.

const SEARCH_BUDGET_MS = 4000;

let worker = null;
let nextId = 0;
const waiting = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const done = waiting.get(data.id);
      if (!done) return;
      waiting.delete(data.id);
      if (data.error) console.warn('Best-move search failed:', data.error);
      done(data.error ? null : data.best);
    };
    worker.onerror = (event) => {
      console.warn('Best-move search stopped:', event.message);
      waiting.forEach((done) => done(null));
      waiting.clear();
      worker = null;
    };
  }
  return worker;
}

// Resolves { placements, score, words } or null when nothing is found or search isn't possible.
export function findBest(board, rack) {
  if (typeof Worker === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = ++nextId;
    waiting.set(id, resolve);
    try {
      getWorker().postMessage({ id, board, rack, budgetMs: SEARCH_BUDGET_MS });
    } catch (err) {
      waiting.delete(id);
      console.warn('Best-move search unavailable:', err.message);
      resolve(null);
    }
  });
}

export function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => { setTimeout(() => resolve(null), ms); })]);
}
