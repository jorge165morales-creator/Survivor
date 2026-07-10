import { z } from "zod";

// These schemas validate request *shape* only (what a well-formed payload looks
// like). Game rules — team already used, matchday locked, user eliminated —
// are NOT expressed here; that's the game-engine's job (apps/api/src/game-engine),
// enforced server-side regardless of what the client sends.

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(50),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const appleSignInSchema = z.object({
  identityToken: z.string().min(1),
  displayName: z.string().min(1).max(50).optional(),
});
export type AppleSignInInput = z.infer<typeof appleSignInSchema>;

export const googleSignInSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const createLeagueSchema = z.object({
  name: z.string().min(1).max(50),
  seasonId: z.string().uuid(),
});
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;

export const joinLeagueSchema = z.object({
  inviteCode: z.string().min(1),
});
export type JoinLeagueInput = z.infer<typeof joinLeagueSchema>;

export const updateLeagueSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    maxMembers: z.number().int().min(2).max(500).optional(),
  })
  .refine((data) => data.name !== undefined || data.maxMembers !== undefined, {
    message: "Provide at least one field to update",
  });
export type UpdateLeagueInput = z.infer<typeof updateLeagueSchema>;

export const submitPickSchema = z.object({
  teamId: z.string().uuid(),
});
export type SubmitPickInput = z.infer<typeof submitPickSchema>;

export const adminFixtureOverrideSchema = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  status: z.enum(["FINISHED", "POSTPONED", "CANCELLED"]),
});
export type AdminFixtureOverrideInput = z.infer<typeof adminFixtureOverrideSchema>;

export const registerPushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
