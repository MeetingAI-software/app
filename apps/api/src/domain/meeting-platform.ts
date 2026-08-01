import type { MeetingPlatform } from './types';

/** Host suffix → platform. Order matters only for readability; suffixes are disjoint. */
const PLATFORM_HOSTS: Array<{ suffix: string; platform: MeetingPlatform }> = [
  { suffix: 'zoom.us', platform: 'zoom' },
  { suffix: 'meet.google.com', platform: 'google_meet' },
  { suffix: 'teams.microsoft.com', platform: 'teams' },
  { suffix: 'teams.live.com', platform: 'teams' },
];

/**
 * Resolve the meeting platform from its join URL, or null if we don't support it.
 * Matches on the parsed host — a substring check would accept `evil.com/?x=zoom.us`.
 */
export function detectPlatform(meetingUrl: string): MeetingPlatform | null {
  let host: string;
  try {
    host = new URL(meetingUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  for (const { suffix, platform } of PLATFORM_HOSTS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return platform;
    }
  }
  return null;
}

export const SUPPORTED_PLATFORMS_MESSAGE =
  'Only Zoom (zoom.us), Google Meet (meet.google.com) and Microsoft Teams (teams.microsoft.com) meetings are supported';
