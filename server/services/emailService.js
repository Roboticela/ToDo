import nodemailer from "nodemailer";
import { config } from "../config.js";
import { createUnsubscribeToken } from "./unsubscribeToken.js";
import {
  getVerificationEmail,
  getEmailChangeEmail,
  getPasswordResetEmail,
  getWelcomeEmail,
  getSubscriptionReminderEmail,
} from "../EmailStructures/index.js";

function getUnsubscribeUrl(userId) {
  if (!userId) return null;
  const token = createUnsubscribeToken(userId);
  return `${config.backendUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  return transporter;
}

/**
 * Send email. No-op if SMTP not configured.
 */
export async function sendMail({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport) {
    console.warn("[email] SMTP not configured, skipping send:", subject, to);
    return;
  }
  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text: text || (html ? html.replace(/<[^>]+>/g, "").trim() : ""),
    html: html || undefined,
  });
}

/**
 * Email verification – confirm email address
 */
export async function sendVerificationEmail(to, userName, verifyToken, userId = null) {
  const verifyUrl = `${config.backendUrl}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
  const unsubscribeUrl = getUnsubscribeUrl(userId);
  const { subject, text, html } = getVerificationEmail({ verifyUrl, userName, unsubscribeUrl });
  await sendMail({ to, subject, text, html });
}

/**
 * Email change – confirm new email address
 */
export async function sendEmailChangeEmail(to, userName, newEmail, confirmToken, userId = null) {
  const confirmUrl = `${config.backendUrl}/api/auth/confirm-email-change?token=${encodeURIComponent(confirmToken)}`;
  const unsubscribeUrl = getUnsubscribeUrl(userId);
  const { subject, text, html } = getEmailChangeEmail({ confirmUrl, userName, newEmail, unsubscribeUrl });
  await sendMail({ to, subject, text, html });
}

/**
 * Password reset
 */
export async function sendPasswordResetEmail(to, resetToken, userName, userId = null) {
  const resetUrl = `${config.frontendUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
  const unsubscribeUrl = getUnsubscribeUrl(userId);
  const { subject, text, html } = getPasswordResetEmail({ resetUrl, userName, unsubscribeUrl });
  await sendMail({ to, subject, text, html });
}

/**
 * Welcome after registration
 */
export async function sendWelcomeEmail(to, userName, userId = null) {
  const unsubscribeUrl = getUnsubscribeUrl(userId);
  const { subject, text, html } = getWelcomeEmail({
    userName,
    appUrl: config.frontendUrl,
    unsubscribeUrl,
  });
  await sendMail({ to, subject, text, html });
}

/**
 * Subscription reminder (free plan). Include unsubscribe link using signed token.
 */
export async function sendSubscriptionReminderEmail(to, userName, unsubscribeToken) {
  const subscriptionUrl = `${config.frontendUrl}/todo/subscription`;
  const unsubscribeUrl = `${config.backendUrl}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const { subject, text, html } = getSubscriptionReminderEmail({
    userName,
    subscriptionUrl,
    unsubscribeUrl,
  });
  await sendMail({ to, subject, text, html });
}
