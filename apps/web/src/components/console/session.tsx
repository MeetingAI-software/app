'use client';

import { createContext, useContext } from 'react';
import type { SubscriptionSummary, UsageSummary, User } from '@/lib/api';

/**
 * AppShell already probes /api/auth/me, /usage and /subscription for the rail. Pages under the
 * shell read those values from here instead of re-fetching them.
 */
export interface SessionValue {
  user: User | null;
  usage: UsageSummary | null;
  subscription: SubscriptionSummary | null;
}

const SessionContext = createContext<SessionValue>({
  user: null,
  usage: null,
  subscription: null,
});

export const SessionProvider = SessionContext.Provider;

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
