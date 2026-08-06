import { createContext, use, useCallback, type PropsWithChildren } from 'react';

import { useStorageState } from './storage';

interface OnboardingContextValue {
  hasSeenHowToPlay: boolean;
  isLoading: boolean;
  markHowToPlaySeen: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const value = use(OnboardingContext);
  if (!value) {
    throw new Error('useOnboarding must be used within an <OnboardingProvider />');
  }
  return value;
}

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [[isLoading, seen], setSeen] = useStorageState<boolean>('survivor-has-seen-how-to-play');

  const markHowToPlaySeen = useCallback(() => setSeen(true), [setSeen]);

  return (
    <OnboardingContext value={{ hasSeenHowToPlay: !!seen, isLoading, markHowToPlaySeen }}>
      {children}
    </OnboardingContext>
  );
}
