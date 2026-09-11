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

// Swedish, unlike the rest of the public site: while the product is paused, the people reaching
// this dialog are the ones we are talking to directly, and they are Swedish.
export const COMING_SOON_COPY: Record<ComingSoonVariant, ComingSoonCopy> = {
  signin: {
    eyebrow: 'Snart lansering',
    title: 'Kontona öppnar inom kort',
    body:
      'Syncmemos är i slutskedet av att byggas. Inloggningen håller stängt tills de sista bitarna är på plats, så att inget går sönder mitt i ditt första möte.',
    note: 'Titta gärna runt på sajten under tiden — priserna och ett exempelmemo finns redan här.',
    dismiss: 'Jag förstår',
  },
  upgrade: {
    eyebrow: 'Snart lansering',
    title: 'Planerna säljs inte än',
    body:
      'Betalningen är pausad tills Syncmemos lanseras. Planerna och priserna nedan är de slutgiltiga, men det går inte att prenumerera eller uppgradera än.',
    note: 'Vi öppnar betalningen så fort produkten är klar — ingen betalning dras innan dess.',
    dismiss: 'Jag förstår',
  },
};
