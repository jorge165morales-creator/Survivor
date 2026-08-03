import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, MaxContentWidth } from '@/constants/theme';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

export default function RulesScreen() {
  const theme = useTheme();
  const { t } = useLocale();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          {t.rules.title}
        </ThemedText>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {t.rules.items.map((rule, i) => (
            <View key={rule.title} style={styles.ruleRow}>
              <View style={[styles.ruleNumber, { backgroundColor: theme.primary }]}>
                <ThemedText style={styles.ruleNumberText}>{i + 1}</ThemedText>
              </View>
              <View style={styles.ruleTextBlock}>
                <ThemedText type="smallBold">{rule.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {rule.body}
                </ThemedText>
              </View>
            </View>
          ))}
        </ScrollView>
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
    paddingBottom: BottomTabInset,
  },
  title: { textAlign: 'center', marginBottom: Spacing.one },
  scrollContent: { gap: Spacing.four, paddingBottom: Spacing.five },
  ruleRow: { flexDirection: 'row', gap: Spacing.three },
  ruleNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ruleNumberText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ruleTextBlock: { flex: 1, gap: Spacing.half },
});
