import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

/** The "how to play" walkthrough shown in place of a member's league list until they have one. */
export function HowToPlayContent() {
  const theme = useTheme();
  const { t } = useLocale();

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.four },
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
});
