// ports/password-hasher.port.ts — Day 5
// Keeps the hashing algorithm swappable: argon2id today, bcrypt or anything else later,
// with zero edits outside adapters/auth. The application layer knows only this interface.
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}
