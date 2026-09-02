import { randomBytes } from "node:crypto";

// Excludes 0/O and 1/I/L — easy to misread or mistype off a phone screen or
// a friend reading it aloud. 32 characters exactly so `byte % alphabet.length`
// below has zero modulo bias (256 / 32 = 8).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

// Short, human-typeable league invite codes (e.g. "K7QX2M"), replacing
// Prisma's default cuid() (~25 random characters) which was too long to
// read off a screen or retype accurately — a single mistyped character
// anywhere in a 25-character code just looks like "invalid code" to the
// person trying to join. leagues.service.ts retries on collision since,
// unlike cuid(), this isn't collision-proof by construction (32^6 ≈ 1
// billion possibilities is still comfortably enough for this app's scale).
export function generateInviteCode(): string {
  const bytes = randomBytes(LENGTH);
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}
