import { createContext, use, useCallback, type PropsWithChildren } from "react";
import type { AuthTokensResponse, AuthUser } from "@survivor/shared-types";
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

  return (
    <SessionContext value={{ session: session ?? null, isLoading, signIn, signOut }}>
      {children}
    </SessionContext>
  );
}
