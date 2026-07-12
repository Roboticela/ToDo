import { emailLayout, buttonStyle } from "./layout.js";

/**
 * Subscription reminder – user is on free plan; encourage upgrade. Includes unsubscribe.
 */
export function getSubscriptionReminderEmail({ userName, subscriptionUrl, unsubscribeUrl }) {
  const subject = "Unlock more with Roboticela ToDo";
  const bodyHtml = `
    <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #0f172a;">Hi ${userName},</p>
    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #334155;">You're on the <strong>Free</strong> plan. Upgrade to <strong>Basic</strong> or <strong>Pro</strong> for more task history, repeat tasks, and analytics.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 8px 0 24px 0; width: 100%; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0;">
      <tr>
        <td style="padding: 16px 20px; background: #f8fafc;">
          <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #334155;">Basic — $2/mo</p>
          <p style="margin: 0; font-size: 13px; color: #64748b;">2 weeks history · 10 repeat tasks · Analytics</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 20px; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #6366f1;">Pro — $5/mo</p>
          <p style="margin: 0; font-size: 13px; color: #64748b;">Unlimited everything · Priority support</p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
      <tr>
        <td>
          <a href="${subscriptionUrl}" style="${buttonStyle()}">View plans</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #64748b;">You're receiving this because you have a Roboticela ToDo account. Cancel anytime from your account settings.</p>
  `;
  const html = emailLayout({ bodyHtml, unsubscribeUrl });
  const text = `Hi ${userName},\n\nYou're on the free plan. Upgrade to Basic or Pro for more features.\n\nView plans: ${subscriptionUrl}\n\nUnsubscribe: ${unsubscribeUrl}\n\nRoboticela ToDo`;
  return { subject, text, html };
}
