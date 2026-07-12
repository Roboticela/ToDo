import { emailLayout, buttonStyle } from "./layout.js";

/**
 * Welcome – after registration
 */
export function getWelcomeEmail({ userName, appUrl, unsubscribeUrl }) {
  const subject = "Welcome to Roboticela ToDo";
  const bodyHtml = `
    <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #0f172a;">Hi ${userName},</p>
    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #334155;">Welcome to Roboticela ToDo! You're all set to organize your tasks and get more done.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
      <tr>
        <td>
          <a href="${appUrl}" style="${buttonStyle()}">Open ToDo</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #64748b;">We'll send you helpful tips and product updates from time to time. You can manage your preferences anytime in Settings.</p>
    <p style="margin: 24px 0 0 0; font-size: 15px; color: #334155;">Best,<br/><strong>The Roboticela Team</strong></p>
  `;
  const html = emailLayout({ bodyHtml, unsubscribeUrl });
  let text = `Hi ${userName},\n\nWelcome to Roboticela ToDo. You can start organizing your tasks right away.\n\nOpen the app: ${appUrl}\n\nBest,\nRoboticela ToDo`;
  if (unsubscribeUrl) text += `\n\nUnsubscribe from these emails: ${unsubscribeUrl}`;
  return { subject, text, html };
}
