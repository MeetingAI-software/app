// Pre-launch gate for the public site.
//
// While this is on, the deployed build keeps every existing flow intact but refuses to let
// visitors start one: sign-in/sign-up submits and Paddle checkout are intercepted and answered
// with a "coming soon" dialog instead. Nothing below the gate is modified — flipping
// NEXT_PUBLIC_LAUNCH_PAUSED to `false` restores the product exactly as it was.
export const LAUNCH_PAUSED = process.env.NEXT_PUBLIC_LAUNCH_PAUSED !== 'false';

export type ComingSoonVariant = 'signin' | 'upgrade';

interface ComingSoonCopy {
  eyebrow: string;
  title: string;
  body: string;
  note: string;
  dismiss: string;
}

export const COMING_SOON_COPY: Record<ComingSoonVariant, ComingSoonCopy> = {
  signin: {
    eyebrow: 'Launching soon',
    title: 'Accounts open shortly',
    body:
      'Syncmemos is in the final stretch of being built. Sign-in stays closed while we finish the last pieces, so nothing breaks in the middle of your first meeting.',
    note: 'Have a look around the site in the meantime — pricing and a sample memo are already live.',
    dismiss: 'Got it',
  },
  upgrade: {
    eyebrow: 'Launching soon',
    title: 'Plans are not on sale yet',
    body:
      'Checkout is paused until Syncmemos launches. The plans and prices below are final, but you cannot subscribe or upgrade just yet.',
    note: 'We will open billing as soon as the product is ready — no payment is taken before then.',
    dismiss: 'Got it',
  },
};
