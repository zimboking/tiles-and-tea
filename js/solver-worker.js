// Runs the best-move search off the main thread so the board stays responsive.
import { findBestMove } from './solver.js';

const WORD_LIST_URL = '../words-au.txt';
let dictionary = null;

function loadDictionary() {
  if (!dictionary) {
    dictionary = fetch(WORD_LIST_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Word list returned ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const words = text.split('\n').map((w) => w.trim()).filter(Boolean).sort();
        const set = new Set(words);
        const hasPrefix = (prefix) => {
          let lo = 0;
          let hi = words.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (words[mid] < prefix) lo = mid + 1; else hi = mid;
          }
          return lo < words.length && words[lo].startsWith(prefix);
        };
        return { isWord: (w) => set.has(w), hasPrefix };
      });
  }
  return dictionary;
}

self.onmessage = async ({ data }) => {
  try {
    const dict = await loadDictionary();
    const best = findBestMove(data.board, data.rack, dict, Date.now() + data.budgetMs);
    self.postMessage({ id: data.id, best });
  } catch (err) {
    dictionary = null;
    self.postMessage({ id: data.id, error: err.message });
  }
};
