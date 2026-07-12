import { emailLayout, buttonStyle } from "./layout.js";

/**
 * Email change – confirm your new email address
 */
export function getEmailChangeEmail({ confirmUrl, userName, newEmail, unsubscribeUrl }) {
  const subject = "Confirm your new email – Roboticela ToDo";
  const bodyHtml = `
    <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #0f172a;">Hi ${userName},</p>
    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #334155;">You requested to change your email address to <strong style="color: #6366f1;">${newEmail}</strong>. Click the button below to confirm. This link expires in <strong>1 hour</strong>.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
      <tr>
        <td>
          <a href="${confirmUrl}" style="${buttonStyle()}">Confirm new email</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #64748b;">If you didn't request this change, ignore this email and your email will stay the same.</p>
    <p style="margin: 20px 0 0 0; font-size: 13px; color: #94a3b8;">If the button doesn't work, copy and paste this link:</p>
    <p style="margin: 4px 0 0 0; font-size: 12px; word-break: break-all;"><a href="${confirmUrl}" style="color: #6366f1; text-decoration: underline;">${confirmUrl}</a></p>
  `;
  const html = emailLayout({ bodyHtml, unsubscribeUrl });
  let text = `Hi ${userName},\n\nYou requested to change your email to ${newEmail}. Click the link below to confirm (valid for 1 hour):\n${confirmUrl}\n\nIf you didn't request this change, ignore this email.\n\nRoboticela ToDo`;
  if (unsubscribeUrl) text += `\n\nUnsubscribe from these emails: ${unsubscribeUrl}`;
  return { subject, text, html };
}
