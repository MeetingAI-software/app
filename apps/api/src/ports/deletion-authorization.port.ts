export interface DeletionChallenge {
  userId: string;
  sessionId: string;
  googleSub: string;
  stateHash: string;
  nonceHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface DeletionAuthorizationRepository {
  replace(input: DeletionChallenge): Promise<void>;
  claim(input: { stateHash: string; sessionId: string; userId: string; now: Date }): Promise<DeletionChallenge | null>;
  issueGrant(input: { stateHash: string; grantHash: string; expiresAt: Date; now: Date }): Promise<boolean>;
  consumeGrant(input: { grantHash: string; sessionId: string; userId: string; googleSub: string; now: Date }): Promise<boolean>;
}

/** Only claims from a cryptographically verified Google ID token may cross this boundary. */
export interface GoogleDeletionIdentity {
  authorizationUrl(state: string, nonce: string): string;
  verifyCode(code: string): Promise<{ sub?: string; nonce?: string; iss?: string; aud?: string; iat?: number; exp?: number }>;
  audience: string;
}
