import { createContext, use, useCallback, type PropsWithChildren } from 'react';

import { useStorageState } from '@/state/storage';
import { en, es, type Translations } from './translations';

export type Locale = 'en' | 'es';

const TRANSLATIONS: Record<Locale, Translations> = { en, es };

interface LocaleContextValue {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const value = use(LocaleContext);
  if (!value) {
    throw new Error('useLocale must be used within a <LocaleProvider />');
  }
  return value;
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [[, storedLocale], setStoredLocale] = useStorageState<Locale>('survivor-locale');
  const locale = storedLocale ?? 'en';

  const setLocale = useCallback((next: Locale) => setStoredLocale(next), [setStoredLocale]);

  return <LocaleContext value={{ locale, t: TRANSLATIONS[locale], setLocale }}>{children}</LocaleContext>;
}
