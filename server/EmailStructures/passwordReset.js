import { emailLayout, buttonStyle } from "./layout.js";

/**
 * Password reset – link to set a new password
 */
export function getPasswordResetEmail({ resetUrl, userName, unsubscribeUrl }) {
  const subject = "Reset your password – Roboticela ToDo";
  const bodyHtml = `
    <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #0f172a;">Hi ${userName},</p>
    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #334155;">We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong>1 hour</strong>.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
      <tr>
        <td>
          <a href="${resetUrl}" style="${buttonStyle()}">Reset password</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #64748b;">If you didn't request a reset, you can safely ignore this email. Your password will remain unchanged.</p>
    <p style="margin: 20px 0 0 0; font-size: 13px; color: #94a3b8;">If the button doesn't work, copy and paste this link:</p>
    <p style="margin: 4px 0 0 0; font-size: 12px; word-break: break-all;"><a href="${resetUrl}" style="color: #6366f1; text-decoration: underline;">${resetUrl}</a></p>
  `;
  const html = emailLayout({ bodyHtml, unsubscribeUrl });
  let text = `Hi ${userName},\n\nUse this link to reset your password (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.\n\nRoboticela ToDo`;
  if (unsubscribeUrl) text += `\n\nUnsubscribe from these emails: ${unsubscribeUrl}`;
  return { subject, text, html };
}
