'use strict';
// Email (Resend), SMS (Twilio) or a generic webhook. Nothing configured = the message is only printed to the server console.
const E = process.env, enabled = !!(E.NOTIFY_WEBHOOK || E.RESEND_KEY || E.TWILIO_SID);
const post = async (url, headers, body) => { const r = await fetch(url, { method: 'POST', headers, body }); if (!r.ok) throw new Error(url.split('/')[2] + ' answered ' + r.status); };
async function send(to, subject, text) {
  try {
    const email = /@/.test(to);
    if (E.NOTIFY_WEBHOOK) return await post(E.NOTIFY_WEBHOOK, { 'content-type': 'application/json' }, JSON.stringify({ to, subject, text }));
    if (email && E.RESEND_KEY) return await post('https://api.resend.com/emails', { Authorization: 'Bearer ' + E.RESEND_KEY, 'content-type': 'application/json' }, JSON.stringify({ from: E.MAIL_FROM || 'Instadrop <onboarding@resend.dev>', to: [to], subject, text }));
    if (!email && E.TWILIO_SID && E.TWILIO_TOKEN && E.TWILIO_FROM) return await post(`https://api.twilio.com/2010-04-01/Accounts/${E.TWILIO_SID}/Messages.json`, { Authorization: 'Basic ' + Buffer.from(E.TWILIO_SID + ':' + E.TWILIO_TOKEN).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' }, new URLSearchParams({ To: String(to).startsWith('+') ? to : '+' + to, From: E.TWILIO_FROM, Body: subject + ': ' + text }));
  } catch (e) { console.error('[notify] failed:', e.message); }
  console.log(`[notify] to=${to} | ${subject} | ${text}`);
}
module.exports = { send, enabled };
