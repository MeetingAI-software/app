import { Router } from 'express';
import { z } from 'zod';
import { fixedWindowLimiter } from '../middleware/rate-limit';
import type { WaitlistRepository } from '../../../ports/repositories.port';

/**
 * The pre-launch waitlist. Public and unauthenticated by necessity — the whole point is that the
 * people using it cannot sign in yet.
 *
 * The response is deliberately identical whether the address was new or already on the list. This
 * endpoint takes an address nobody has proved they own, so a distinguishable answer would turn it
 * into a "does this person want Syncmemos" oracle for anyone who can type an email.
 */
export function createWaitlistRoutes(waitlist: WaitlistRepository): Router {
  const router = Router();

  const signupSchema = z.object({
    email: z.string().trim().email().max(254),   // RFC 5321 max address length
    source: z.enum(['signin', 'upgrade']).default('signin'),
  });

  // Unauthenticated and it writes a row, so the only thing between it and a script is the IP. The
  // insert is idempotent per address, which caps the damage at junk rows; 10/hour leaves room for
  // a household behind one NAT and a person fixing a typo.
  const waitlistLimiter = fixedWindowLimiter({
    max: 10,
    windowMs: 60 * 60 * 1000,
    keyOf: (req) => `waitlist:${req.ip}`,
  });

  router.post('/api/waitlist', waitlistLimiter, async (req, res, next) => {
    try {
      const { email, source } = signupSchema.parse(req.body);
      await waitlist.add({ email, source });
      return res.status(201).json({ joined: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
