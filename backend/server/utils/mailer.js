#!/usr/bin/env node
// Mailer con SendGrid opcional, SMTP de respaldo y simulación en desarrollo

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
} catch (_) {
  sgMail = null;
}

const API_KEY = process.env.SENDGRID_API_KEY;
if (API_KEY && sgMail) {
  try { sgMail.setApiKey(API_KEY); } catch (_) {}
}

function resolveFrom() {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || process.env.SMTP_FROM_NAME || 'Seguridad Tecnocel';
  if (!fromEmail) return null;
  return `${fromName} <${fromEmail}>`;
}

async function sendWithSendgrid(to, code) {
  if (!sgMail || !API_KEY) return false;
  const from = resolveFrom();
  if (!from) return false;
  const msg = {
    to,
    from,
    subject: 'Código de verificación',
    text: `Tu código es: ${code}`,
    html: `<p>Tu código es: <b>${code}</b></p>`,
  };
  try {
    await sgMail.send(msg);
    return true;
  } catch (e) {
    console.warn('[mailer] SendGrid falló, se intentará fallback SMTP:', e.message);
    return false;
  }
}

async function sendWithSmtp(to, code) {
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (_) { return false; }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return false;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const from = resolveFrom();
  try { await transporter.verify(); } catch (_) {}
  await transporter.sendMail({
    from: from || SMTP_USER,
    to,
    subject: 'Código de verificación',
    text: `Tu código es: ${code}`,
    html: `<p>Tu código es: <b>${code}</b></p>`,
  });
  return true;
}

async function sendVerificationEmail(to, code) {
  if (await sendWithSendgrid(to, code)) return { provider: 'sendgrid' };
  if (await sendWithSmtp(to, code)) return { provider: 'smtp' };
  console.warn(`[mailer] Simulación de envío: código=${code} para ${to}`);
  return { simulated: true };
}

module.exports = { sendVerificationEmail };

