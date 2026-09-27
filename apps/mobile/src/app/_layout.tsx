import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/outfit';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LocaleProvider } from '@/i18n/locale';
import { SessionProvider, useSession } from '@/state/session';
import { OnboardingProvider, useHasSeenOnboarding } from '@/state/onboarding';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { session, isLoading } = useSession();
  const { isLoading: onboardingLoading, hasSeenOnboarding } = useHasSeenOnboarding();

  if (isLoading || onboardingLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      {/* First-launch-only "how it works" carousel — shown once before
          sign-in/sign-up, then never again on this device (see
          state/onboarding.tsx). Mutually exclusive with the group below so
          exactly one is ever the active unauthenticated route. */}
      <Stack.Protected guard={!session && !hasSeenOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={!session && hasSeenOnboarding}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>

      {/* Always reachable (independent of the onboarding flag) since these
          are only ever landed on via a password-reset email's deep link —
          gating them on hasSeenOnboarding could strand a reinstalled app on
          the onboarding carousel instead of the actual reset link. */}
      <Stack.Protected guard={!session}>
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  if (!fontsLoaded) {
    // Native splash screen (held open by preventAutoHideAsync above) stays
    // visible until this flips — AnimatedSplashOverlay is what calls
    // hideAsync, so nothing renders in the system-default font first.
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LocaleProvider>
        <SessionProvider>
          <OnboardingProvider>
            <AnimatedSplashOverlay />
            <RootNavigator />
          </OnboardingProvider>
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
