import '../core/main.js';

import { onChange, t } from '../core/i18n.js';
import { attachCounter, attachForm, validators } from '../core/forms.js';

const form = document.getElementById('contact-form');
const successPanel = document.getElementById('contact-success');

function init() {
  if (!form) return;

  attachCounter(document.getElementById('cf-message'), document.getElementById('message-counter'), 3000);

  attachForm(form, {
    endpoint: '/leads/contact',
    button: document.getElementById('contact-submit'),
    busyText: t('common.sending'),
    alertsId: 'contact-alerts',
    successMessage: t('toast.contactSuccess'),
    rules: {
      name: validators.name,
      email: validators.email,
      phone: (value) => validators.phone(value, { required: false }),
      message: validators.message,
      consent: validators.consent,
    },
    payload: (data) => ({
      name: data.name,
      email: data.email,
      phone: data.phone || '',
      topic: data.topic || 'general',
      subject: data.subject || '',
      message: data.message,
      consent: true,
    }),
    onSuccess: () => {
      form.hidden = true;
      if (successPanel) {
        successPanel.hidden = false;
        successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
  });

  document.getElementById('contact-another')?.addEventListener('click', () => {
    form.reset();
    form.hidden = false;
    if (successPanel) successPanel.hidden = true;
    form.querySelector('#cf-name')?.focus();
  });
}

init();
onChange(init);
