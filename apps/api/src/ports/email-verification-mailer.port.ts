export interface VerificationEmailMessage {
  to: string;
  verificationUrl: string;
  expiresAt: Date;
}

/** Delivery boundary; replace the log adapter with a real email provider without changing auth. */
export interface EmailVerificationMailer {
  sendVerificationEmail(message: VerificationEmailMessage): Promise<void>;
}
