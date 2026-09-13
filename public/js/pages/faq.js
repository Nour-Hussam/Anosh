import '../core/main.js';

import { api } from '../core/api.js';
import { emptyState, faqItem } from '../core/components.js';
import { onChange, t } from '../core/i18n.js';
import { initAccordion, initReveal } from '../core/ui.js';

const list = document.getElementById('faq-list');
const topics = document.getElementById('faq-topics');
const emptyHost = document.getElementById('faq-empty');

let faqs = [];
let activeTopic = '';

function topicKey(topic) {
  return `faq.${topic}`;
}

function renderTopics() {
  if (!topics) return;
  const unique = [...new Set(faqs.map((f) => f.topic).filter(Boolean))];
  topics.innerHTML = [
    `<button type="button" class="chip" data-topic="" aria-pressed="${activeTopic === ''}">${t('faq.topicAll')}</button>`,
    ...unique.map(
      (topic) =>
        `<button type="button" class="chip" data-topic="${topic.replace(/"/g, '&quot;')}" aria-pressed="${activeTopic === topic}">${t(topicKey(topic))}</button>`
    ),
  ].join('');
}

function render() {
  if (!list) return;
  const visible = activeTopic ? faqs.filter((f) => f.topic === activeTopic) : faqs;

  list.innerHTML = visible.map((faq, index) => faqItem(faq, index)).join('');
  list.setAttribute('aria-busy', 'false');

  if (emptyHost) emptyHost.innerHTML = visible.length ? '' : emptyState(t('faq.empty'));

  renderTopics();
  initAccordion(list, { single: false });
  initReveal(list);

  // Re-open the item referenced in the URL (#faq-panel-3) after a language switch.
  const hash = decodeURIComponent(location.hash).slice(1);
  if (hash) {
    const item = document.getElementById(hash)?.closest('.accordion__item');
    if (item && !item.classList.contains('is-open')) item.querySelector('.accordion__trigger')?.click();
  }
}

topics?.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-topic]');
  if (!chip) return;
  activeTopic = chip.dataset.topic;
  render();
});

async function load() {
  if (list) list.innerHTML = '<div class="skeleton skeleton--line"></div>'.repeat(5);
  try {
    const data = await api.get('/content/faqs');
    faqs = data.items || [];
  } catch {
    faqs = [];
  }
  render();
}

load();
onChange(render);
