import sendEmail from './nodeMailer.js'

function buildOtpEmailHtml({ recipientName, code, expiryMinutes }) {
  const name = recipientName || 'there'
  const digits = String(code)
    .split('')
    .map(
      (digit) =>
        `<td style="padding:0 5px;">
          <div style="width:44px;height:56px;line-height:56px;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#0f2744;font-size:26px;font-weight:700;letter-spacing:1px;">${digit}</div>
        </td>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="x-apple-disable-message-reformatting" />
  </head>
  <body style="background-color:#ffffff;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,Cantarell,'Helvetica Neue',sans-serif;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f4f5;padding:24px 12px;">
      <tr>
        <td align="center">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#0f2744;padding:20px 24px;color:#ffffff;font-size:18px;font-weight:600;">
                Funds Verifier
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${name},</p>
                <p style="margin:0 0 20px;color:#111827;font-size:16px;font-weight:600;">
                  Your sign-in verification code
                </p>
                <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.5;">
                  Enter this 6-digit code to finish signing in to your Funds Verifier dashboard.
                </p>

                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 22px;">
                  <tr>${digits}</tr>
                </table>

                <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.5;">
                  This code expires in <strong>${expiryMinutes} minutes</strong> and can be used once.
                </p>
                <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
                  If you did not try to sign in, you can ignore this email and your password stays safe.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;">
                This is an automated message from Funds Verifier. Never share this code with anyone.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Email a 6-digit login verification code. Never throws.
 */
export default async function sendLoginOtpEmail({
  to,
  recipientName,
  code,
  expiryMinutes = 10,
}) {
  try {
    if (!to || !code) {
      return { success: false, message: 'Missing recipient or code' }
    }

    if (
      !process.env.SMTP_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASS
    ) {
      return { success: false, message: 'Email is not configured on the server' }
    }

    const result = await sendEmail({
      to,
      subject: `${code} is your Funds Verifier sign-in code`,
      text: `Hi ${recipientName || 'there'},\n\nYour Funds Verifier sign-in code is ${code}.\nIt expires in ${expiryMinutes} minutes and can be used once.\n\nIf you did not try to sign in, you can ignore this email.\n`,
      html: buildOtpEmailHtml({ recipientName, code, expiryMinutes }),
    })

    return {
      success: Boolean(result?.success),
      message: result?.success
        ? 'Verification code sent'
        : result?.error || 'Failed to send verification code',
    }
  } catch (error) {
    console.error('sendLoginOtpEmail error:', error?.message || error)
    return {
      success: false,
      message: error?.message || 'Failed to send verification code',
    }
  }
}
