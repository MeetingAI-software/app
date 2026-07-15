import crypto from 'crypto';
import { config } from '../../config/env';

export function verifyWebhookSignature(req: any): boolean {
  if (config.BOT_PROVIDER === 'fake') {
    // Verification is bypassed when using fake provider to allow simulated local webhooks.
    return true;
  }

  const secret = config.RECALL_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('⚠️ RECALL_WEBHOOK_SECRET is not configured. Webhook verification failed.');
    return false;
  }

  const svixId = req.headers['webhook-id'] || req.headers['svix-id'];
  const svixTimestamp = req.headers['webhook-timestamp'] || req.headers['svix-timestamp'];
  const svixSignature = req.headers['webhook-signature'] || req.headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn('⚠️ Webhook request is missing signature headers');
    return false;
  }

  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';

  try {
    // Extract part after 'whsec_' prefix and decode from base64
    const secretKey = secret.replace(/^whsec_/, '');
    const secretBytes = Buffer.from(secretKey, 'base64');

    // Create the signed content: ID + "." + Timestamp + "." + RawBody
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

    // Calculate expected HMAC SHA-256 signature
    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // svixSignature can be space-separated signatures
    const signatures = String(svixSignature).split(' ');
    for (const sig of signatures) {
      const actualSig = sig.startsWith('v1,') ? sig.slice(3) : sig;
      
      const actualBuffer = Buffer.from(actualSig, 'base64');
      const expectedBuffer = Buffer.from(expectedSignature, 'base64');

      if (actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
        return true;
      }
    }

    console.warn('⚠️ Webhook signature verification failed: signature mismatch');
    return false;
  } catch (err: any) {
    console.error('❌ Error during webhook signature verification:', err);
    return false;
  }
}
