import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { goBackOrHome } from '@/utils/navigation';
import { useTheme } from '@/hooks/use-theme';

const RULES: { title: string; body: string }[] = [
  {
    title: 'One pick per matchday',
    body: 'Each matchday, pick one team you think will win or draw. You can change your pick as many times as you like until the matchday locks.',
  },
  {
    title: 'A draw always survives',
    body: 'If your team draws, you survive to the next matchday. Only an outright loss eliminates you.',
  },
  {
    title: 'You can only use a team once',
    body: "Once you've picked a team, it's used up for the rest of the season in this league — you can't pick it again.",
  },
  {
    title: 'Running out of teams eliminates you',
    body: "If every team left in a matchday's fixtures has already been used by you, you have no valid pick available — you'll be eliminated when that matchday locks, the same as missing a pick.",
  },
  {
    title: 'Missing a pick eliminates you',
    body: 'If a matchday locks and you never submitted a pick, you are eliminated — the same as if your pick had lost.',
  },
  {
    title: 'Buy-back (if enabled by your commissioner)',
    body: 'A commissioner can grant one eliminated member a single reinstatement per season. The used-up team from the loss still counts as used.',
  },
  {
    title: 'Tie-break: buy-back used',
    body: "If two members are tied (eliminated on the same matchday, or both still alive at the end), the member who has NOT used a buy-back ranks above the one who has.",
  },
];

export default function RulesScreen() {
  useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={goBackOrHome} style={styles.backButton}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        <ThemedText type="title" style={styles.title}>
          Rules
        </ThemedText>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {RULES.map((rule, i) => (
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
    gap: Spacing.two,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  backButton: { paddingTop: Spacing.three },
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
