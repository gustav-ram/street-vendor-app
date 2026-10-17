import { hash, verify } from '@node-rs/argon2';

// argon2id with the library defaults (m=19 MiB, t=2, p=1), which match the
// OWASP recommendation.

export function hashSecret(secret: string) {
  return hash(secret);
}

export function verifySecret(stored: string, secret: string) {
  return verify(stored, secret).catch(() => false);
}

// Verified against when the account doesn't exist, so a login for an unknown
// email takes as long as one for a known email.
let dummyHash: Promise<string> | undefined;
export async function burnVerifyTime(secret: string) {
  dummyHash ??= hash('timing-equalizer-not-a-real-password');
  await verifySecret(await dummyHash, secret);
}
