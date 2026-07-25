import type { AuthUserResponse } from './api';

export const AUTHENTICATED_DESTINATION = '/meetings';
export const VERIFICATION_REQUIRED_DESTINATION = '/meetings?verification=required';

/** Keeps successful auth navigation aligned with the status calculated by the API. */
export function destinationAfterAuthentication(
  response: Pick<AuthUserResponse, 'emailVerificationRequired'>,
): string {
  return response.emailVerificationRequired
    ? VERIFICATION_REQUIRED_DESTINATION
    : AUTHENTICATED_DESTINATION;
}
