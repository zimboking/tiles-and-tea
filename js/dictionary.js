// Optional word check against the Australian English SCOWL list (size 80, see words-LICENSE.txt).
// If the list can't load, every word is allowed.

const WORD_LIST_URL = 'words-au.txt';

let words = null;
let loading = null;

export function loadDictionary() {
  if (!loading) {
    loading = fetch(WORD_LIST_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Word list returned ${res.status}`);
        return res.text();
      })
      .then((text) => { words = new Set(text.split('\n').map((w) => w.trim().toUpperCase())); })
      .catch((err) => { console.warn('Word check is off:', err.message); });
  }
  return loading;
}

export function unknownWords(list) {
  return words ? list.filter((w) => !words.has(w)) : [];
}
