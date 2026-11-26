// Word definitions, from the free Dictionary API (dictionaryapi.dev). Only the word itself is sent.
const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const MAX_MEANINGS = 4;
const WORD = /^[A-Za-z]{2,15}$/;
const cache = new Map();

const $ = (id) => document.getElementById(id);

async function lookUp(word) {
  if (cache.has(word)) return cache.get(word);
  const res = await fetch(API + encodeURIComponent(word.toLowerCase()));
  if (res.status === 404) { cache.set(word, []); return []; }
  if (!res.ok) throw new Error(`the dictionary replied ${res.status}`);
  const entries = await res.json();
  const meanings = entries.flatMap((e) => e.meanings ?? []).flatMap((m) =>
    (m.definitions ?? []).slice(0, 2).map((d) => ({ part: m.partOfSpeech, text: d.definition })))
    .filter((m) => typeof m.text === 'string')
    .slice(0, MAX_MEANINGS);
  cache.set(word, meanings);
  return meanings;
}

function showBody(nodes) {
  $('define-body').replaceChildren(...nodes);
}

function para(text, className = '') {
  const p = document.createElement('p');
  p.textContent = text;
  if (className) p.className = className;
  return p;
}

export async function showDefinition(word) {
  if (!WORD.test(word)) return;
  const dialog = $('define');
  const close = () => { dialog.hidden = true; };
  $('define-word').textContent = word.toUpperCase();
  $('define-more').href = `https://en.wiktionary.org/wiki/${encodeURIComponent(word.toLowerCase())}`;
  $('define-close').onclick = close;
  dialog.onclick = (e) => { if (e.target === dialog) close(); };
  showBody([para('Looking it up…', 'muted')]);
  dialog.hidden = false;
  $('define-close').focus();
  try {
    const meanings = await lookUp(word);
    if (meanings.length === 0) {
      showBody([para("This dictionary doesn't have it. It may still be in the word list: try Wiktionary.", 'muted')]);
      return;
    }
    const list = document.createElement('ol');
    list.className = 'meanings';
    list.append(...meanings.map((m) => {
      const li = document.createElement('li');
      const part = document.createElement('em');
      part.textContent = m.part ? `${m.part} ` : '';
      li.append(part, m.text);
      return li;
    }));
    showBody([list]);
  } catch (err) {
    showBody([para(`Couldn't look it up: ${err.message}.`, 'muted')]);
  }
}
