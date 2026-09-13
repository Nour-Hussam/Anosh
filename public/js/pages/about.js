import '../core/main.js';

import { api } from '../core/api.js';
import { onChange } from '../core/i18n.js';
import { initCounters, initReveal, number } from '../core/ui.js';

/** The about page is mostly static bilingual copy; only the live numbers come from the API. */
async function loadStats() {
  try {
    const { stats } = await api.get('/content/site');
    if (!stats) return;
    document.querySelectorAll('[data-stat]').forEach((el) => {
      const value = stats[el.dataset.stat];
      if (value === undefined || value === null) return;
      el.dataset.count = String(value);
      el.textContent = number(value);
    });
    initCounters();
  } catch {
    /* static fallback numbers already sit in the markup */
  }
}

loadStats();
initReveal();
onChange(initReveal);
