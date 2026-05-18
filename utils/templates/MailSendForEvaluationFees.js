export default async function MailSendForEvaluationFees({ name, currency = "AED", amount = 2500, assetTitle }) {
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #f6f9fc">
    <table
      border="0"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      align="center"
      style="background-color: #f6f9fc; margin: 0; padding: 0; width: 100%"
    >
      <tbody>
        <tr>
          <td
            style="
              background-color: #f6f9fc;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                'Helvetica Neue', Ubuntu, sans-serif;
              margin: 0;
              padding: 0;
            "
          >
            <table
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="
                max-width: 600px;
                background-color: #ffffff;
                margin: 0 auto;
                padding: 20px 0 48px 0;
                margin-bottom: 64px;
              "
            >
              <tbody>
                <tr style="width: 100%">
                  <td style="padding: 0">
                    <table
                      align="center"
                      width="100%"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="padding: 0 48px"
                    >
                      <tbody>
                        <tr>
                          <td style="padding: 0">
                            <p
                              style="
                                font-size: 16px;
                                line-height: 24px;
                                color: #525f7f;
                                text-align: left;
                                margin: 16px 0;
                              "
                            >
                              Dear${name ? ` ${name}` : ""},
                            </p>
                            <hr
                              style="
                                width: 100%;
                                border: none;
                                border-top: 1px solid #e6ebf1;
                                margin: 20px 0;
                              "
                            />
                            <p
                              style="
                                font-size: 16px;
                                line-height: 24px;
                                color: #525f7f;
                                text-align: left;
                                margin: 16px 0;
                              "
                            >
                              We have successfully deducted
                              <strong>${amount} ${currency}</strong> from your Stripe account
                              as an <strong>evaluation fee</strong> for your
                              selected product ${assetTitle ? `(${assetTitle})` : ""}.
                            </p>
                            <p
                              style="
                                font-size: 16px;
                                line-height: 24px;
                                color: #525f7f;
                                text-align: left;
                                margin: 16px 0;
                              "
                            >
                              You can view the details of this transaction and
                              manage your account directly from your Stripe
                              dashboard.
                            </p>
                            <a
                              href="https://dashboard.stripe.com/login"
                              target="_blank"
                              style="
                                line-height: 100%;
                                text-decoration: none;
                                display: block;
                                max-width: 100%;
                                background-color: #656ee8;
                                border-radius: 5px;
                                color: #ffffff;
                                font-size: 16px;
                                font-weight: bold;
                                text-align: center;
                                padding: 10px 10px 10px 10px;
                              "
                            >
                              View your Stripe Dashboard
                            </a>
                            <hr
                              style="
                                width: 100%;
                                border: none;
                                border-top: 1px solid #e6ebf1;
                                margin: 20px 0;
                              "
                            />
                            <p
                              style="
                                font-size: 16px;
                                line-height: 24px;
                                color: #525f7f;
                                text-align: left;
                                margin: 16px 0;
                              "
                            >
                              If you have any questions about this charge or
                              need assistance, you can visit us.
                            </p>
                            <p
                              style="
                                font-size: 16px;
                                line-height: 24px;
                                color: #525f7f;
                                text-align: left;
                                margin: 16px 0;
                              "
                            >
                              — FUNDS VERIFIER's team
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
`
}