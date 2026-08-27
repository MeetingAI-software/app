import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HowItWorks } from './HowItWorks';

describe('HowItWorks', () => {
  it('is the anchor the hero and the nav link to', () => {
    const html = renderToStaticMarkup(<HowItWorks />);

    expect(html).toContain('id="how-it-works"');
  });

  // The rail is the substance: it has to be readable without JavaScript, without motion and to a
  // screen reader, because the stage beside it is decorative and aria-hidden.
  it('spells out all three steps in the server-rendered markup', () => {
    const html = renderToStaticMarkup(<HowItWorks />);

    expect(html).toContain('Start the meeting');
    expect(html).toContain('Let everyone say hello');
    expect(html).toContain('The memo writes itself');
  });

  it('names every way into a meeting', () => {
    const html = renderToStaticMarkup(<HowItWorks />);

    expect(html).toContain('Zoom, Google Meet or Teams');
    expect(html).toContain('Hit record on your phone');
  });

  // The summary is produced by the pipeline with nothing to press (process-upload-event.service),
  // and that is the part visitors most often ask about.
  it('says the memo is produced automatically', () => {
    const html = renderToStaticMarkup(<HowItWorks />);

    expect(html).toContain('Nothing to press when you hang up');
    expect(html).toContain('generated automatically');
  });

  // mapSpeakers() assigns names by order of first utterance — it is not voice recognition, and the
  // page must not imply that it is.
  it('explains name matching as first-to-speak order, not voice recognition', () => {
    const html = renderToStaticMarkup(<HowItWorks />);

    expect(html).toContain('in the order people first speak');
    expect(html).not.toMatch(/voice (recognition|print)/i);
  });

  it('hands off to the memo preview further down the page', () => {
    const html = renderToStaticMarkup(<HowItWorks />);

    expect(html).toContain('href="#demo"');
  });

  // Without JS the player never ticks, so the server frame has to be the finished one rather than
  // a stack of opacity-0 elements.
  it('renders the finished frame rather than an empty stage', () => {
    const html = renderToStaticMarkup(<HowItWorks />);

    expect(html).toContain('https://us02web.zoom.us/j/84210093');
    expect(html).not.toContain('opacity:0');
  });

  // The frames hold five transcript lines and three takeaways. Nobody should come away thinking a
  // two-hour meeting is summarised in that much and no more.
  it('says out loud that the demo is a shortened one', () => {
    const html = renderToStaticMarkup(<HowItWorks />);

    expect(html).toContain('A shortened demo');
    expect(html).toContain('run far longer than the few lines shown here');
  });
});
