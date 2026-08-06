import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';
import { useOnboarding } from '@/state/onboarding';

export default function HowToPlayScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { markHowToPlaySeen } = useOnboarding();

  function handleGetStarted() {
    markHowToPlaySeen();
    router.replace('/sign-up');
  }

  function handleSignIn() {
    markHowToPlaySeen();
    router.replace('/sign-in');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          {t.howToPlay.title}
        </ThemedText>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
            {t.howToPlay.intro}
          </ThemedText>

          {t.howToPlay.steps.map((step, i) => (
            <View key={step.title} style={styles.stepRow}>
              <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
                <ThemedText style={styles.stepNumberText}>{i + 1}</ThemedText>
              </View>
              <View style={styles.stepTextBlock}>
                <ThemedText type="smallBold">{step.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {step.body}
                </ThemedText>
              </View>
            </View>
          ))}

          <ThemedView type="backgroundElement" style={styles.challengeCard}>
            <ThemedText type="smallBold" style={styles.challengeText}>
              {t.howToPlay.challengeNote}
            </ThemedText>
          </ThemedView>
        </ScrollView>

        <GradientButton onPress={handleGetStarted} style={styles.button}>
          {t.howToPlay.getStarted}
        </GradientButton>
        <ThemedText type="linkPrimary" onPress={handleSignIn} style={styles.link}>
          {t.howToPlay.haveAccount}
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  title: { textAlign: 'center', marginBottom: Spacing.one },
  scrollContent: { gap: Spacing.four, paddingBottom: Spacing.four },
  intro: { textAlign: 'center' },
  stepRow: { flexDirection: 'row', gap: Spacing.three },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumberText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepTextBlock: { flex: 1, gap: Spacing.half },
  challengeCard: {
    borderRadius: 16,
    padding: Spacing.three,
  },
  challengeText: { textAlign: 'center' },
  button: { marginTop: Spacing.two },
  link: { alignSelf: 'center', marginTop: Spacing.two, marginBottom: Spacing.two },
});
