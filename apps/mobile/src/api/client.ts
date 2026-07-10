import type {
  AppleSignInInput,
  CreateLeagueInput,
  GoogleSignInInput,
  JoinLeagueInput,
  LoginInput,
  RegisterInput,
  UpdateLeagueInput,
} from "@survivor/shared-validation";
import type {
  AuthTokensResponse,
  AuthUser,
  InviteLinkResponse,
  LeagueDetail,
  LeagueSummary,
  SeasonSummary,
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

async function post<TResponse>(path: string, body: unknown, accessToken?: string): Promise<TResponse> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload.message ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as TResponse;
  }
  return res.json();
}

async function get<TResponse>(path: string, accessToken: string): Promise<TResponse> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload.message ?? `Request failed with status ${res.status}`);
  }
  return res.json();
}

async function patch<TResponse>(path: string, body: unknown, accessToken: string): Promise<TResponse> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload.message ?? `Request failed with status ${res.status}`);
  }
  return res.json();
}

async function del(path: string, accessToken: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload.message ?? `Request failed with status ${res.status}`);
  }
}

export const authApi = {
  register: (input: RegisterInput) => post<AuthTokensResponse>("/auth/register", input),
  login: (input: LoginInput) => post<AuthTokensResponse>("/auth/login", input),
  signInWithApple: (input: AppleSignInInput) => post<AuthTokensResponse>("/auth/apple", input),
  signInWithGoogle: (input: GoogleSignInInput) => post<AuthTokensResponse>("/auth/google", input),
  refresh: (refreshToken: string) =>
    post<AuthTokensResponse>("/auth/refresh", { refreshToken }),
  logout: (accessToken: string) => post<void>("/auth/logout", {}, accessToken),
};

export const usersApi = {
  me: (accessToken: string) => get<AuthUser>("/users/me", accessToken),
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
};

export const seasonsApi = {
  active: (accessToken: string) => get<SeasonSummary>("/seasons/active", accessToken),
};
