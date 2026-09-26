export type GoogleOAuthPurpose = 'login' | 'link';

export interface GoogleOAuthChallenge {
  stateHash: string;
  nonceHash: string;
  purpose: GoogleOAuthPurpose;
  userId: string | null;
  sessionHash: string | null;
  authVersion: number | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface GoogleOAuthStateRepository {
  issue(challenge: GoogleOAuthChallenge): Promise<boolean>;
  claim(stateHash: string, now: Date): Promise<GoogleOAuthChallenge | null>;
}
