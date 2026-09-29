export interface LoginAdmissionRepository {
  admit(input: { ip: string; email: string; now: Date }): Promise<boolean>;
  admitSignup(input: { ip: string; email: string; now: Date }): Promise<boolean>;
}
