import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATED_DESTINATION,
  destinationAfterAuthentication,
  VERIFICATION_REQUIRED_DESTINATION,
} from './auth-flow';

describe('destinationAfterAuthentication', () => {
  it('sends verified users directly to the meetings dashboard', () => {
    expect(destinationAfterAuthentication({ emailVerificationRequired: false }))
      .toBe(AUTHENTICATED_DESTINATION);
  });

  it('preserves the verification-required state for unverified users', () => {
    expect(destinationAfterAuthentication({ emailVerificationRequired: true }))
      .toBe(VERIFICATION_REQUIRED_DESTINATION);
  });
});
