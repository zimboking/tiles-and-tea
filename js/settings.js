// Per-phone display settings, kept in this browser only.
const BIG_TEXT_KEY = 'tiles-and-tea:big-text';

function readBigText() {
  try { return localStorage.getItem(BIG_TEXT_KEY) === '1'; } catch { return false; }
}

function applyBigText(on) {
  document.documentElement.classList.toggle('big', on);
}

// Applies the saved setting now, and keeps it in step with the checkbox.
export function setUpBigText(checkbox) {
  const on = readBigText();
  applyBigText(on);
  if (!checkbox) return;
  checkbox.checked = on;
  checkbox.addEventListener('change', () => {
    applyBigText(checkbox.checked);
    try { localStorage.setItem(BIG_TEXT_KEY, checkbox.checked ? '1' : '0'); } catch { /* setting just won't stick */ }
  });
}
