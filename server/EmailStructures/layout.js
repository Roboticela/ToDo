/**
 * Shared email layout: wrapper, header, body slot, footer with unsubscribe.
 * All styles inline for email client compatibility.
 */
export function emailLayout({ bodyHtml, unsubscribeUrl }) {
  const unsubscribeBlock =
    unsubscribeUrl &&
    `
    <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.5;">
      <a href="${unsubscribeUrl}" style="color: #6366f1; text-decoration: underline;">Unsubscribe from these emails</a>
    </p>
  `;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Roboticela ToDo</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06); overflow: hidden;">
          <tr>
            <td style="padding: 32px 40px 24px 40px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">Roboticela ToDo</h1>
                    <p style="margin: 4px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.85);">Organize your tasks, get things done</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 36px 40px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 32px 40px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;">© ${new Date().getFullYear()} Roboticela. All rights reserved.</p>
              ${unsubscribeBlock || ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/** Primary CTA button styles (inline for email). */
export function buttonStyle() {
  return "display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff !important; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);";
}
