import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InRoomUnavailableNotice from './InRoomUnavailableNotice';

describe('in-room recording availability', () => {
  it('explains the operational block without offering a recording action', () => {
    const html = renderToStaticMarkup(<InRoomUnavailableNotice />);

    expect(html).toContain('In-room recording is currently unavailable');
    expect(html).toContain('Online meeting bots are still available');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('Start Recording Session');
  });
});
