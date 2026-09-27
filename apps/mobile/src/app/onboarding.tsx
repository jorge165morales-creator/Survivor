import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useHasSeenOnboarding } from '@/state/onboarding';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

/**
 * First-launch-only "how it works" carousel — see state/onboarding.ts for
 * the persisted flag that keeps this from ever showing again on this
 * device, and app/_layout.tsx for the routing guard that puts it ahead of
 * sign-in/sign-up the very first time.
 */
export default function OnboardingScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { markSeen } = useHasSeenOnboarding();
  const [step, setStep] = useState(0);

  const slides = t.onboarding.slides;
  const slide = slides[step];
  const isLast = step === slides.length - 1;

  function handleSkip() {
    markSeen();
    router.replace('/sign-in');
  }

  function handleNext() {
    if (isLast) {
      markSeen();
      router.replace('/sign-up');
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topRow}>
          <LanguageToggle />
          <Pressable onPress={handleSkip} hitSlop={8}>
            <ThemedText type="link" themeColor="textSecondary">
              {t.onboarding.skip}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={[styles.badge, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.badgeText}>{step + 1}</ThemedText>
          </View>
          <ThemedText type="title" style={styles.slideTitle}>
            {slide.title}
          </ThemedText>
          <ThemedText type="subtitle" themeColor="textSecondary" style={styles.slideBody}>
            {slide.body}
          </ThemedText>
        </View>

        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === step ? theme.primary : theme.border }]} />
          ))}
        </View>

        <GradientButton onPress={handleNext} style={styles.button}>
          {isLast ? t.onboarding.getStarted : t.onboarding.next}
        </GradientButton>

        <Pressable onPress={handleSkip} style={styles.signInLink}>
          <ThemedText type="linkPrimary">{t.onboarding.alreadyHaveAccount}</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  badgeText: {
    color: '#fff',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 22,
  },
  slideTitle: { textAlign: 'center' },
  slideBody: { textAlign: 'center' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.three,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  button: {},
  signInLink: { alignSelf: 'center', marginTop: Spacing.three },
});
