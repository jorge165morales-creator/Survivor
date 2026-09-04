import type {
  AppleSignInInput,
  ChangePasswordInput,
  CreateLeagueInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  GoogleSignInInput,
  JoinLeagueInput,
  LoginInput,
  RegisterInput,
  RegisterPushTokenInput,
  ResetPasswordInput,
  UpdateLeagueInput,
} from "@survivor/shared-validation";
import type {
  AuthTokensResponse,
  AuthUser,
  InviteLinkResponse,
  LeagueDetail,
  LeagueSummary,
  MatchdaySummary,
  PickHistoryResponse,
  PickOptionsResponse,
  SeasonSummary,
  StandingsGridResponse,
  StandingsResponse,
} from "@survivor/shared-types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Access tokens expire after 15 minutes (see apps/api/src/common/token.service.ts).
// The request helpers below don't have access to React state, so
// SessionProvider registers callbacks here to receive silently-refreshed
// tokens (and to be told to sign out if the refresh token itself has
// expired) — every call site just passes its snapshot of accessToken and
// gets a transparent retry on a 401, without needing to know about refresh
// at all.
type SessionBridge = {
  refreshToken: string | null;
  onTokensRefreshed: (tokens: AuthTokensResponse) => void;
  onRefreshFailed: () => void;
};
let sessionBridge: SessionBridge | null = null;
let inFlightRefresh: Promise<string | null> | null = null;

export function registerSessionBridge(bridge: SessionBridge | null) {
  sessionBridge = bridge;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!sessionBridge?.refreshToken) return null;
  if (!inFlightRefresh) {
    inFlightRefresh = post<AuthTokensResponse>("/auth/refresh", { refreshToken: sessionBridge.refreshToken })
      .then((tokens) => {
        sessionBridge?.onTokensRefreshed(tokens);
        return tokens.accessToken;
      })
      .catch(() => {
        sessionBridge?.onRefreshFailed();
        return null;
      })
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

const REQUEST_TIMEOUT_MS = 15_000;
// Our Render instance is on the free tier and spins down after ~15 minutes
// idle; waking it back up can take longer than REQUEST_TIMEOUT_MS. A single
// automatic retry with more headroom smooths that over instead of surfacing
// a timeout error on what's often just a cold start.
const TIMEOUT_RETRY_DELAY_MS = 1_500;
const TIMEOUT_RETRY_TIMEOUT_MS = 25_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<TResponse>(
  method: string,
  path: string,
  body: unknown | undefined,
  accessToken: string | undefined,
  isRetry = false,
  isTimeoutRetry = false,
  // Writes default to not-retryable: a timeout means we never heard back,
  // and for most writes (submitting a pick, logging in) we can't tell
  // whether it already landed on the server. Pass true only for a write
  // that's confirmed idempotent — e.g. setting a flag to an exact value.
  retryable = false,
): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutMs = isTimeoutRetry ? TIMEOUT_RETRY_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if ((method === "GET" || retryable) && !isTimeoutRetry) {
        await delay(TIMEOUT_RETRY_DELAY_MS);
        return request<TResponse>(method, path, body, accessToken, isRetry, true, retryable);
      }
      throw new ApiError(0, "The request timed out. Check your connection and try again.");
    }
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 && accessToken && !isRetry) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      return request<TResponse>(method, path, body, newAccessToken, true);
    }
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload.message ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as TResponse;
  }
  return res.json();
}

async function post<TResponse>(
  path: string,
  body: unknown,
  accessToken?: string,
  retryable = false,
): Promise<TResponse> {
  return request<TResponse>("POST", path, body, accessToken, false, false, retryable);
}

async function get<TResponse>(path: string, accessToken: string): Promise<TResponse> {
  return request<TResponse>("GET", path, undefined, accessToken);
}

async function put<TResponse>(path: string, body: unknown, accessToken: string): Promise<TResponse> {
  return request<TResponse>("PUT", path, body, accessToken);
}

async function patch<TResponse>(path: string, body: unknown, accessToken: string): Promise<TResponse> {
  return request<TResponse>("PATCH", path, body, accessToken);
}

async function del(path: string, accessToken: string): Promise<void> {
  await request<void>("DELETE", path, undefined, accessToken);
}

async function delWithBody<TResponse>(path: string, body: unknown, accessToken: string): Promise<TResponse> {
  return request<TResponse>("DELETE", path, body, accessToken);
}

export const authApi = {
  register: (input: RegisterInput) => post<AuthTokensResponse>("/auth/register", input),
  login: (input: LoginInput) => post<AuthTokensResponse>("/auth/login", input),
  signInWithApple: (input: AppleSignInInput) => post<AuthTokensResponse>("/auth/apple", input),
  signInWithGoogle: (input: GoogleSignInInput) => post<AuthTokensResponse>("/auth/google", input),
  refresh: (refreshToken: string) =>
    post<AuthTokensResponse>("/auth/refresh", { refreshToken }),
  logout: (accessToken: string) => post<void>("/auth/logout", {}, accessToken),
  forgotPassword: (input: ForgotPasswordInput) => post<void>("/auth/forgot-password", input),
  resetPassword: (input: ResetPasswordInput) => post<void>("/auth/reset-password", input),
  changePassword: (input: ChangePasswordInput, accessToken: string) =>
    post<void>("/auth/change-password", input, accessToken),
  deleteAccount: (input: DeleteAccountInput, accessToken: string) =>
    delWithBody<void>("/auth/account", input, accessToken),
};

export const usersApi = {
  me: (accessToken: string) => get<AuthUser>("/users/me", accessToken),
  registerPushToken: (input: RegisterPushTokenInput, accessToken: string) =>
    post<void>("/users/push-token", input, accessToken),
};

export const leaguesApi = {
  mine: (accessToken: string) => get<LeagueSummary[]>("/leagues/mine", accessToken),
  create: (input: CreateLeagueInput, accessToken: string) =>
    post<LeagueSummary>("/leagues", input, accessToken),
  join: (input: JoinLeagueInput, accessToken: string) =>
    post<LeagueSummary>("/leagues/join", input, accessToken),
  getById: (id: string, accessToken: string) => get<LeagueDetail>(`/leagues/${id}`, accessToken),
  update: (id: string, input: UpdateLeagueInput, accessToken: string) =>
    patch<LeagueSummary>(`/leagues/${id}`, input, accessToken),
  inviteLink: (id: string, accessToken: string) =>
    post<InviteLinkResponse>(`/leagues/${id}/invite-link`, {}, accessToken),
  leave: (id: string, accessToken: string) => del(`/leagues/${id}/members/me`, accessToken),
  grantBuyBack: (id: string, userId: string, accessToken: string) =>
    post<LeagueSummary>(`/leagues/${id}/members/${userId}/grant-buy-back`, {}, accessToken),
  // Retryable: markMemberPaid just sets hasPaid to an exact boolean and only
  // stamps paidAt on the first false-to-true transition, so a retry after a
  // timeout (e.g. a cold-started server) can't double-apply anything.
  markPaid: (id: string, userId: string, hasPaid: boolean, accessToken: string) =>
    post<LeagueSummary>(`/leagues/${id}/members/${userId}/mark-paid`, { hasPaid }, accessToken, true),
};

export const seasonsApi = {
  active: (accessToken: string) => get<SeasonSummary>("/seasons/active", accessToken),
  all: (accessToken: string) => get<SeasonSummary[]>("/seasons", accessToken),
  matchdays: (seasonId: string, accessToken: string) =>
    get<MatchdaySummary[]>(`/seasons/${seasonId}/matchdays`, accessToken),
};

export const picksApi = {
  pickOptions: (leagueId: string, matchdayId: string, accessToken: string) =>
    get<PickOptionsResponse>(`/leagues/${leagueId}/matchdays/${matchdayId}/pick-options`, accessToken),
  // Response body isn't used — callers re-fetch pick-options after a
  // successful submit to get the canonical updated state.
  submitPick: (leagueId: string, matchdayId: string, teamId: string, accessToken: string) =>
    post<unknown>(`/leagues/${leagueId}/matchdays/${matchdayId}/picks`, { teamId }, accessToken),
  changePick: (leagueId: string, matchdayId: string, teamId: string, accessToken: string) =>
    put<unknown>(`/leagues/${leagueId}/matchdays/${matchdayId}/picks`, { teamId }, accessToken),
  myPicks: (leagueId: string, accessToken: string) =>
    get<PickHistoryResponse>(`/leagues/${leagueId}/picks/me`, accessToken),
};

export const standingsApi = {
  get: (leagueId: string, accessToken: string) =>
    get<StandingsResponse>(`/leagues/${leagueId}/standings`, accessToken),
  grid: (leagueId: string, accessToken: string) =>
    get<StandingsGridResponse>(`/leagues/${leagueId}/standings/grid`, accessToken),
};
