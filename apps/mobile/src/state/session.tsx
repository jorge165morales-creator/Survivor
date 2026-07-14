import { createContext, use, useCallback, useEffect, type PropsWithChildren } from "react";
import type { AuthTokensResponse, AuthUser } from "@survivor/shared-types";
import { registerSessionBridge } from "@/api/client";
import { useStorageState } from "./storage";

interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
  signIn: (tokens: AuthTokensResponse) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within a <SessionProvider />");
  }
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [[isLoading, session], setSession] = useStorageState<Session>("survivor-session");

  const signIn = useCallback(
    (tokens: AuthTokensResponse) => {
      setSession({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: tokens.user,
      });
    },
    [setSession],
  );

  const signOut = useCallback(() => {
    setSession(null);
  }, [setSession]);

  // Lets the API client silently refresh an expired access token (and sign
  // the user out if the refresh token itself has expired) without every
  // call site needing to know about the refresh flow.
  useEffect(() => {
    if (!session) {
      registerSessionBridge(null);
      return;
    }
    registerSessionBridge({
      refreshToken: session.refreshToken,
      onTokensRefreshed: (tokens) => {
        setSession({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: tokens.user });
      },
      onRefreshFailed: () => setSession(null),
    });
  }, [session, setSession]);

  return (
    <SessionContext value={{ session: session ?? null, isLoading, signIn, signOut }}>
      {children}
    </SessionContext>
  );
}
