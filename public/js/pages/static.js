import '../core/main.js';

import { onChange } from '../core/i18n.js';
import { initReveal } from '../core/ui.js';

/** Static bilingual pages (privacy, terms) — only the reveal animation is needed. */
initReveal();
onChange(initReveal);
