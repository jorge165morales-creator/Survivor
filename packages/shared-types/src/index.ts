// String-literal unions (not TS enums) mirroring the Prisma schema
// (apps/api/prisma/schema.prisma) exactly. A plain TS `enum` here would be a
// nominally distinct type from Prisma's generated enum of the same name, so
// assigning a Prisma query result's status field to these types would need a
// cast everywhere; literal unions are structurally compatible instead.
// Keep both in sync manually — Prisma is the source of truth for the DB.

export type MatchdayType = "GROUP" | "KNOCKOUT_HOME" | "KNOCKOUT_AWAY" | "FINAL";

export type FixtureStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";

export type FixtureResult = "HOME_WIN" | "AWAY_WIN" | "DRAW";

export type MembershipStatus = "ACTIVE" | "ELIMINATED" | "LEFT";

export type PickOutcome = "PENDING" | "WIN" | "DRAW_FORGIVEN" | "DRAW_ELIMINATED" | "LOSS";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Response shape for register/login/apple/google/refresh */
export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface SeasonSummary {
  id: string;
  name: string;
  year: number;
}

export interface LeagueMemberSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: MembershipStatus;
  isCommissioner: boolean;
  joinedAt: string; // ISO 8601
}

/** Response shape for one entry of GET /leagues/mine */
export interface LeagueSummary {
  id: string;
  name: string;
  inviteCode: string;
  maxMembers: number;
  memberCount: number;
  commissionerId: string;
  season: SeasonSummary;
  myStatus: MembershipStatus;
}

/** Response shape for GET /leagues/:id */
export interface LeagueDetail {
  id: string;
  name: string;
  inviteCode: string;
  maxMembers: number;
  createdAt: string; // ISO 8601
  season: SeasonSummary;
  commissionerId: string;
  members: LeagueMemberSummary[];
}

/** Response shape for POST /leagues/:id/invite-link */
export interface InviteLinkResponse {
  inviteCode: string;
  url: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  shortName: string;
  crestUrl: string | null;
}

export interface FixtureSummary {
  id: string;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  kickoffAt: string; // ISO 8601
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  result: FixtureResult | null;
}

/** Response shape for GET /leagues/:leagueId/matchdays/:matchdayId/pick-options */
export interface PickOptionsResponse {
  matchdayId: string;
  sequence: number;
  type: MatchdayType;
  lockAt: string; // ISO 8601
  isLocked: boolean;
  fixtures: FixtureSummary[];
  usedTeamIds: string[];
  currentPick: { teamId: string; submittedAt: string } | null;
}

export interface StandingsEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: MembershipStatus;
  eliminatedAtMatchdaySequence: number | null;
  tieForgivenessUsed: boolean;
}

/** Response shape for GET /leagues/:leagueId/standings */
export interface StandingsResponse {
  leagueId: string;
  entries: StandingsEntry[];
}
