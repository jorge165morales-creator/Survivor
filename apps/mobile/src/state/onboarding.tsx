import { createContext, use, type PropsWithChildren } from "react";
import { useStorageState } from "./storage";

const KEY = "survivor-has-seen-onboarding";

interface OnboardingContextValue {
  isLoading: boolean;
  hasSeenOnboarding: boolean;
  markSeen: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * Whether the first-launch "how it works" carousel (see app/onboarding.tsx)
 * has already been shown on this device — persisted so it only ever shows
 * once, via the same cross-platform storage as the session token
 * (SecureStore on native, localStorage on web — see storage.ts).
 *
 * Backed by a single Context instance (like useSession) rather than each
 * caller running its own useStorageState — app/_layout.tsx's routing guard
 * and app/onboarding.tsx's "mark as seen on Get Started" both need to react
 * to the *same* value in the *same* render pass; two independent
 * useStorageState("survivor-has-seen-onboarding") calls would each keep
 * their own local copy that only re-syncs from storage on the next mount,
 * so onboarding.tsx marking it seen wouldn't be visible to the router until
 * a reload — right when it's navigating away.
 */
export function useHasSeenOnboarding(): OnboardingContextValue {
  const value = use(OnboardingContext);
  if (!value) {
    throw new Error("useHasSeenOnboarding must be used within an <OnboardingProvider />");
  }
  return value;
}

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [[isLoading, hasSeen], setHasSeen] = useStorageState<boolean>(KEY);

  return (
    <OnboardingContext value={{ isLoading, hasSeenOnboarding: hasSeen === true, markSeen: () => setHasSeen(true) }}>
      {children}
    </OnboardingContext>
  );
}
