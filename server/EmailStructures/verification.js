import { emailLayout, buttonStyle } from "./layout.js";

/**
 * Email verification – confirm your email address
 */
export function getVerificationEmail({ verifyUrl, userName, unsubscribeUrl }) {
  const subject = "Verify your email – Roboticela ToDo";
  const bodyHtml = `
    <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #0f172a;">Hi ${userName},</p>
    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #334155;">Thanks for signing up. Please verify your email address by clicking the button below. This link expires in <strong>24 hours</strong>.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
      <tr>
        <td>
          <a href="${verifyUrl}" style="${buttonStyle()}">Verify my email</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #64748b;">If you didn't create an account, you can safely ignore this email.</p>
    <p style="margin: 20px 0 0 0; font-size: 13px; color: #94a3b8;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="margin: 4px 0 0 0; font-size: 12px; word-break: break-all; color: #6366f1;"><a href="${verifyUrl}" style="color: #6366f1; text-decoration: underline;">${verifyUrl}</a></p>
  `;
  const html = emailLayout({ bodyHtml, unsubscribeUrl });
  let text = `Hi ${userName},\n\nPlease verify your email by clicking the link below (valid for 24 hours):\n${verifyUrl}\n\nIf you didn't create an account, you can ignore this email.\n\nRoboticela ToDo`;
  if (unsubscribeUrl) text += `\n\nUnsubscribe from these emails: ${unsubscribeUrl}`;
  return { subject, text, html };
}
