/** Navigate only after the API confirms the server-side session was revoked. */
export async function revokeSessionBeforeLeaving(
  revoke: () => Promise<void>, navigate: () => void,
): Promise<boolean> {
  try {
    await revoke();
  } catch {
    return false;
  }
  navigate();
  return true;
}
