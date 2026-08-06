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
import { OnboardingProvider, useOnboarding } from '@/state/onboarding';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { session, isLoading: sessionLoading } = useSession();
  const { hasSeenHowToPlay, isLoading: onboardingLoading } = useOnboarding();

  if (sessionLoading || onboardingLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!hasSeenHowToPlay}>
        <Stack.Screen name="how-to-play" />
      </Stack.Protected>

      <Stack.Protected guard={hasSeenHowToPlay && !!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={hasSeenHowToPlay && !session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
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
