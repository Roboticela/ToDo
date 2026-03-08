import nodemailer from "nodemailer";
import { config } from "../config.js";

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
 * Send password reset email with link.
 */
export async function sendPasswordResetEmail(to, resetToken, userName) {
  const resetUrl = `${config.frontendUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
  await sendMail({
    to,
    subject: "Reset your Roboticela ToDo password",
    text: `Hi ${userName},\n\nUse this link to reset your password (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px;">
        <p>Hi ${userName},</p>
        <p>Use the link below to reset your password. It expires in 1 hour.</p>
        <p><a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px;">Reset password</a></p>
        <p>If you didn't request this, you can ignore this email.</p>
        <p style="color: #666; font-size: 12px;">Roboticela ToDo</p>
      </div>
    `,
  });
}

/**
 * Send welcome email after registration.
 */
export async function sendWelcomeEmail(to, userName) {
  await sendMail({
    to,
    subject: "Welcome to Roboticela ToDo",
    text: `Hi ${userName},\n\nWelcome to Roboticela ToDo. You can start organizing your tasks right away.\n\nBest,\nRoboticela ToDo`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px;">
        <p>Hi ${userName},</p>
        <p>Welcome to Roboticela ToDo. You can start organizing your tasks right away.</p>
        <p>Best,<br/>Roboticela ToDo</p>
      </div>
    `,
  });
}
