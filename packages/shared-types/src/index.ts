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

export type PickOutcome = "PENDING" | "WIN" | "DRAW" | "LOSS";

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
  isActive: boolean;
}

/** Response entry for GET /seasons/:seasonId/matchdays */
export interface MatchdaySummary {
  id: string;
  sequence: number;
  type: MatchdayType;
  roundLabel: string;
  lockAt: string; // ISO 8601
}

export interface LeagueMemberSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: MembershipStatus;
  isCommissioner: boolean;
  joinedAt: string; // ISO 8601
  /** Only meaningful when the league's paymentRequired is true. */
  hasPaid: boolean;
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
  buyBackEnabled: boolean;
  paymentRequired: boolean;
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
  buyBackEnabled: boolean;
  paymentRequired: boolean;
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

export interface PickHistoryEntry {
  matchdaySequence: number;
  matchdayType: MatchdayType;
  roundLabel: string;
  team: TeamSummary;
  outcome: PickOutcome;
  submittedAt: string; // ISO 8601
}

/** Response shape for GET /leagues/:leagueId/picks/me */
export interface PickHistoryResponse {
  entries: PickHistoryEntry[];
}

/** Response shape for POST /admin/fixtures and POST /admin/fixtures/:id/override */
export interface AdminFixtureDetail {
  id: string;
  matchdayId: string;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  kickoffAt: string; // ISO 8601
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  result: FixtureResult | null;
}

export interface StandingsEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: MembershipStatus;
  eliminatedAtMatchdaySequence: number | null;
  buyBackAvailable: boolean;
  buyBackUsed: boolean;
}

/** Response shape for GET /leagues/:leagueId/standings */
export interface StandingsResponse {
  leagueId: string;
  entries: StandingsEntry[];
}

export interface StandingsGridMatchday {
  id: string;
  sequence: number;
  type: MatchdayType;
  roundLabel: string;
}

export interface StandingsGridCell {
  team: TeamSummary;
  outcome: PickOutcome;
  fixture: FixtureSummary;
}

export interface StandingsGridRow {
  userId: string;
  displayName: string;
  status: MembershipStatus;
  eliminatedAtMatchdaySequence: number | null;
  buyBackAvailable: boolean;
  buyBackUsed: boolean;
  /** Keyed by matchday id; a missing key means no pick was made that matchday. */
  picks: Record<string, StandingsGridCell>;
}

/** Response shape for GET /leagues/:leagueId/standings/grid */
export interface StandingsGridResponse {
  leagueId: string;
  matchdays: StandingsGridMatchday[];
  rows: StandingsGridRow[];
}
