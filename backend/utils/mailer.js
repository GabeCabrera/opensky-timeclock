/**
 * Simplified Resend-only mailer
 * -----------------------------
 * Responsibilities:
 *  - Initialize a single Resend client (lazy)
 *  - Provide sendMail({to,subject,html,text}) returning {queued,id|error,provider}
 *  - Provide mailerStatus() with basic diagnostics
 */
let ResendClient = null;
try { ResendClient = require('resend').Resend; } catch (_) {}

let resend = null;
let initError = null;
let attempted = false;

function init() {
  if (attempted) return;
  attempted = true;
  const raw = process.env.RESEND_API_KEY || '';
  const key = raw.trim();
  if (!key) {
    initError = 'RESEND_API_KEY not set';
    return;
  }
  if (!ResendClient) {
    initError = 'Resend library not installed';
    return;
  }
  try {
    resend = new ResendClient(key);
  } catch (e) {
    initError = `Failed to init Resend: ${e.message}`;
  }
}

async function sendMail({ to, subject, html, text }) {
  if (!resend && !initError) init();
  const from = process.env.RESEND_FROM || 'no-reply@example.com';
  if (!resend) {
    return { queued: false, disabled: true, error: initError || 'Not initialized', provider: 'resend' };
  }
  try {
    const result = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, '')
    });
    if (result.error) {
      return { queued: false, error: result.error.message, provider: 'resend' };
    }
    return { queued: true, id: result.data?.id, provider: 'resend' };
  } catch (e) {
    return { queued: false, error: e.message, provider: 'resend' };
  }
}

function mailerStatus() {
  if (!resend && !attempted) init();
  return {
    enabled: !!resend,
    provider: resend ? 'resend' : 'none',
    disabledReason: resend ? null : (initError || 'Not initialized'),
    from: process.env.RESEND_FROM || 'no-reply@example.com'
  };
}

module.exports = { sendMail, mailerStatus };
