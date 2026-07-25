import { Resend, type CreateEmailOptions, type CreateEmailResponse } from 'resend';
import type { Logger } from 'pino';
import { logger } from '../../config/logger';
import type {
  EmailVerificationMailer,
  VerificationEmailMessage,
} from '../../ports/email-verification-mailer.port';

export type ResendEmailSender = (payload: CreateEmailOptions) => Promise<CreateEmailResponse>;

/** Production delivery adapter backed by Resend's transactional email API. */
export class ResendEmailVerificationMailer implements EmailVerificationMailer {
  private readonly sendEmail: ResendEmailSender;

  constructor(
    apiKey: string,
    private readonly from: string,
    sendEmail?: ResendEmailSender,
    private readonly log: Pick<Logger, 'info'> = logger,
  ) {
    if (sendEmail) {
      this.sendEmail = sendEmail;
    } else {
      const resend = new Resend(apiKey);
      this.sendEmail = (payload) => resend.emails.send(payload);
    }
  }

  async sendVerificationEmail(message: VerificationEmailMessage): Promise<void> {
    const content = createVerificationEmailContent(message);
    const { data, error } = await this.sendEmail({
      from: this.from,
      to: message.to,
      subject: 'Verify your MeetingAI email address',
      text: content.text,
      html: content.html,
    });

    if (error) {
      throw new Error(`Resend email delivery failed: ${error.message}`);
    }

    this.log.info(
      { to: message.to, resendEmailId: data?.id },
      'Email verification message sent',
    );
  }
}

export function createVerificationEmailContent(
  message: Pick<VerificationEmailMessage, 'verificationUrl' | 'expiresAt'>,
): { text: string; html: string } {
  const expiry = message.expiresAt.toUTCString();
  const safeUrl = escapeHtml(message.verificationUrl);
  const text = [
    'Verify your MeetingAI email address',
    '',
    'Open the link below to verify your email address:',
    message.verificationUrl,
    '',
    `This link expires at ${expiry}.`,
    'If you did not create a MeetingAI account, you can ignore this email.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Verify your MeetingAI email address</title>
</head>
<body style="margin:0; background-color:#f8fafc; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
    <tr>
      <td align="center" bgcolor="#f8fafc" style="background-color:#f8fafc; padding-top:40px; padding-right:16px; padding-bottom:40px; padding-left:16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:8px;">
          <tr>
            <td style="padding-top:32px; padding-right:32px; padding-bottom:32px; padding-left:32px;">
              <p style="margin-top:0; margin-right:0; margin-bottom:20px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:24px; line-height:32px; color:#0f172a; font-weight:700;">Verify your email address</p>
              <p style="margin-top:0; margin-right:0; margin-bottom:24px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:24px; color:#475569;">Confirm your email address to finish setting up your MeetingAI account.</p>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td bgcolor="#0f172a" style="background-color:#0f172a; border-radius:6px;">
                    <a href="${safeUrl}" style="display:inline-block; padding-top:12px; padding-right:20px; padding-bottom:12px; padding-left:20px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:20px; color:#ffffff; font-weight:700; text-decoration:none;">Verify email address</a>
                  </td>
                </tr>
              </table>
              <p style="margin-top:24px; margin-right:0; margin-bottom:8px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#64748b;">This link expires at ${expiry}.</p>
              <p style="margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#64748b;">If you did not create a MeetingAI account, you can ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
