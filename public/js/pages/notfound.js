import '../core/main.js';

import { api } from '../core/api.js';
import { tripCard } from '../core/components.js';
import { onChange } from '../core/i18n.js';

const host = document.getElementById('popular-trips');

async function load() {
  if (!host) return;
  try {
    const data = await api.get('/content/packages', { limit: 3, sort: 'rating' });
    host.innerHTML = (data.items || []).map((pkg) => tripCard(pkg)).join('');
  } catch {
    host.innerHTML = '';
  }
}

load();
onChange(load);
