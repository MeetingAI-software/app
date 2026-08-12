import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RecordingConsent from './RecordingConsent';

describe('RecordingConsent', () => {
  it('renders an accessible unchecked confirmation with all required statements', () => {
    const html = renderToStaticMarkup(
      <RecordingConsent id="recording-consent" checked={false} onChange={() => {}} />,
    );

    expect(html).toContain('id="recording-consent"');
    expect(html).toContain('for="recording-consent"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
    expect(html).toContain('right to record');
    expect(html).toContain('all participants have been informed');
    expect(html).toContain('applicable law and workplace rules');
  });

  it('renders the confirmed state supplied by its parent session', () => {
    const html = renderToStaticMarkup(
      <RecordingConsent id="confirmed-consent" checked onChange={() => {}} />,
    );

    expect(html).toContain('checked=""');
  });
});
