import type { Logger } from 'pino';
import type { CreateEmailResponse } from 'resend';
import { describe, expect, it, vi } from 'vitest';
import {
  createVerificationEmailContent,
  ResendEmailVerificationMailer,
  type ResendEmailSender,
} from './resend-email-verification.mailer';

const message = {
  to: 'person@example.com',
  verificationUrl: 'https://app.example.com/verify-email?token=one&source=email',
  expiresAt: new Date('2026-07-26T12:00:00.000Z'),
};

describe('ResendEmailVerificationMailer', () => {
  it('sends both accessible HTML and plain text without logging the secret URL', async () => {
    const sendEmail = vi.fn<Parameters<ResendEmailSender>, ReturnType<ResendEmailSender>>().mockResolvedValue({
      data: { id: 'email-1' },
      error: null,
    } as CreateEmailResponse);
    const info = vi.fn();
    const mailer = new ResendEmailVerificationMailer(
      're_test',
      'MeetingAI <verify@example.com>',
      sendEmail,
      { info } as unknown as Pick<Logger, 'info'>,
    );

    await mailer.sendVerificationEmail(message);

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'MeetingAI <verify@example.com>',
      to: message.to,
      subject: 'Verify your MeetingAI email address',
      text: expect.stringContaining(message.verificationUrl),
      html: expect.stringContaining('Verify email address'),
    }));
    expect(sendEmail.mock.calls[0][0].html).toContain(
      'token=one&amp;source=email',
    );
    expect(info).toHaveBeenCalledWith(
      { to: message.to, resendEmailId: 'email-1' },
      'Email verification message sent',
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain(message.verificationUrl);
  });

  it('turns a Resend API error into a delivery failure', async () => {
    const sendEmail = vi.fn<Parameters<ResendEmailSender>, ReturnType<ResendEmailSender>>().mockResolvedValue({
      data: null,
      error: { message: 'Domain is not verified', name: 'validation_error' },
    } as CreateEmailResponse);
    const mailer = new ResendEmailVerificationMailer(
      're_test',
      'MeetingAI <verify@example.com>',
      sendEmail,
    );

    await expect(mailer.sendVerificationEmail(message))
      .rejects.toThrow('Resend email delivery failed: Domain is not verified');
  });
});

describe('createVerificationEmailContent', () => {
  it('includes expiry and fallback instructions in both formats', () => {
    const content = createVerificationEmailContent(message);

    expect(content.text).toContain(message.expiresAt.toUTCString());
    expect(content.text).toContain('you can ignore this email');
    expect(content.html).toContain(message.expiresAt.toUTCString());
    expect(content.html).toContain('you can ignore this email');
  });
});
