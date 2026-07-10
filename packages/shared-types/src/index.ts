// Enums mirror the Prisma schema (apps/api/prisma/schema.prisma) exactly.
// Keep both in sync manually — Prisma enums are the source of truth for the DB,
// these are what the mobile app and any non-Prisma code import.

export enum MatchdayType {
  GROUP = "GROUP",
  KNOCKOUT_HOME = "KNOCKOUT_HOME",
  KNOCKOUT_AWAY = "KNOCKOUT_AWAY",
  FINAL = "FINAL",
}

export enum FixtureStatus {
  SCHEDULED = "SCHEDULED",
  LIVE = "LIVE",
  FINISHED = "FINISHED",
  POSTPONED = "POSTPONED",
  CANCELLED = "CANCELLED",
}

export enum FixtureResult {
  HOME_WIN = "HOME_WIN",
  AWAY_WIN = "AWAY_WIN",
  DRAW = "DRAW",
}

export enum MembershipStatus {
  ACTIVE = "ACTIVE",
  ELIMINATED = "ELIMINATED",
  LEFT = "LEFT",
}

export enum PickOutcome {
  PENDING = "PENDING",
  WIN = "WIN",
  DRAW_FORGIVEN = "DRAW_FORGIVEN",
  DRAW_ELIMINATED = "DRAW_ELIMINATED",
  LOSS = "LOSS",
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
