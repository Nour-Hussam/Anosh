import nodemailer from 'nodemailer';

import { config } from '../config.js';
import logger from '../utils/logger.js';

let transporter = null;
if (config.mail.enabled) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    timeout: 15_000,
    // Do not trust arbitrary headers from user input.
    requireTLS: !config.mail.secure,
  });
}

/** HTML-escapes every dynamic value that reaches an email template. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(title, bodyHtml) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f5f2ec;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#16211d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6dfd2;">
        <tr><td style="background:#0a5c42;color:#fff;padding:18px 24px;">
          <strong style="font-size:18px;">رحلات المملكة</strong>
          <span style="opacity:.85;font-size:13px;"> &nbsp;|&nbsp; Kingdom Journeys</span>
        </td></tr>
        <tr><td style="padding:24px;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 24px;background:#faf7f1;color:#6b6455;font-size:12px;border-top:1px solid #e6dfd2;">
          هذه رسالة آلية من موقع رحلات المملكة — لا ترد عليها مباشرة.<br>
          Automated message from the Kingdom Journeys website.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function send({ to, subject, html, text }) {
  const payload = { from: config.mail.from, to, subject, html, text };

  if (!transporter) {
    logger.info('mail.disabled_log_only', { to, subject });
    logger.debug('mail.body_preview', { text: (text || '').slice(0, 500) });
    return { queued: false, logged: true };
  }

  try {
    await transporter.sendMail(payload);
    logger.info('mail.sent', { to, subject });
    return { queued: true, logged: false };
  } catch (err) {
    // Never throw into the request path: the lead is already saved in the DB.
    logger.error('mail.send_failed', { to, subject, message: err.message });
    return { queued: false, logged: false, error: err.message };
  }
}

export function bookingAdminEmail(booking, pkgTitle) {
  const rows = [
    ['رقم الحجز / Reference', booking.reference],
    ['الباقة / Package', pkgTitle || '—'],
    ['الاسم / Name', booking.full_name],
    ['البريد / Email', booking.email],
    ['الجوال / Phone', booking.phone || '—'],
    ['الدولة / Country', booking.country || '—'],
    ['المسافرون / Travelers', `${booking.travelers} (${booking.adults} بالغ، ${booking.children} طفل)`],
    ['تاريخ الرحلة / Travel date', booking.travel_date || '—'],
    ['الإجمالي / Total', `${booking.total_sar} SAR`],
    ['طريقة التواصل / Contact via', booking.preferred_contact],
    ['ملاحظات / Notes', booking.notes || '—'],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#6b6455;width:200px;">${esc(k)}</td>
         <td style="padding:6px 8px;border-bottom:1px solid #eee;">${esc(v)}</td></tr>`
    )
    .join('');

  return send({
    to: config.mail.to,
    subject: `[حجز جديد ${booking.reference}] ${booking.full_name}`,
    html: shell('حجز جديد', `<h2 style="margin:0 0 12px;font-size:18px;">طلب حجز جديد على الموقع</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <p style="margin-top:18px;"><a href="${esc(config.baseUrl)}/admin/" style="background:#0a5c42;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">فتح لوحة التحكم</a></p>`),
    text: `طلب حجز جديد\n${rows.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')}`,
  });
}

export function bookingConfirmationEmail(booking, pkgTitle) {
  return send({
    to: booking.email,
    subject: `استلمنا طلب حجزك ${booking.reference} — رحلات المملكة`,
    html: shell(
      'تأكيد الاستلام',
      `<h2 style="margin:0 0 8px;font-size:19px;">أهلاً ${esc(booking.full_name)} 👋</h2>
       <p style="line-height:1.8;">استلمنا طلب حجزك لباقة <strong>${esc(pkgTitle || '—')}</strong>، وفريقنا هيتواصل معاك خلال ساعات العمل
       (السبت–الخميس، 9 ص – 7 م) لتأكيد التفاصيل وطرق الدفع.</p>
       <p style="line-height:1.8;"><strong>رقم الحجز:</strong> ${esc(booking.reference)}</p>
       <p style="line-height:1.8;color:#6b6455;font-size:13px;">We received your booking request and our team will contact you shortly to confirm the details.</p>`
    ),
    text: `أهلاً ${booking.full_name}، استلمنا طلب حجزك رقم ${booking.reference}. سنتواصل معك قريباً. — رحلات المملكة`,
  });
}

export function messageAdminEmail(msg) {
  return send({
    to: config.mail.to,
    subject: `[رسالة جديدة] ${msg.subject || msg.name}`,
    html: shell(
      'رسالة جديدة',
      `<h2 style="margin:0 0 12px;font-size:18px;">رسالة جديدة من نموذج التواصل</h2>
       <p><strong>${esc(msg.name)}</strong> — ${esc(msg.email)} ${msg.phone ? `— ${esc(msg.phone)}` : ''}</p>
       <p style="background:#faf7f1;border:1px solid #e6dfd2;border-radius:10px;padding:12px;line-height:1.8;">${esc(msg.body)}</p>`
    ),
    text: `رسالة جديدة من ${msg.name} (${msg.email}): ${msg.body}`,
  });
}

export default send;
