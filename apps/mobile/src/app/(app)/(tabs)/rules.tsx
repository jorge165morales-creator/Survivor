import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompetitionSummary, LeagueSummary } from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi } from '@/api/client';
import { useSession } from '@/state/session';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

// Shown before any league has loaded (or if the account has none yet) — the
// Champions League is still the flagship/default competition, so this keeps
// the tab's old behavior unchanged for that case.
const FALLBACK_COMPETITION: CompetitionSummary = {
  slug: 'ucl',
  name: 'UEFA Champions League',
  structure: 'GROUP_AND_KNOCKOUT',
  matchdayCount: 17,
};

interface RuleItem {
  title: string;
  body: string;
}

export default function RulesScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { session } = useSession();
  // Deep-linked from inside a league (see leagues/[id]/index.tsx and
  // standings.tsx) so this screen can show the right competition's rules
  // immediately, without waiting on its own leaguesApi.mine() call below.
  const params = useLocalSearchParams<{ competitionSlug?: string; competitionName?: string; structure?: string; matchdayCount?: string }>();
  const linkedCompetition: CompetitionSummary | null =
    params.competitionSlug && params.structure && params.matchdayCount
      ? {
          slug: params.competitionSlug,
          name: params.competitionName ?? params.competitionSlug,
          structure: params.structure === 'ROUND_ROBIN' ? 'ROUND_ROBIN' : 'GROUP_AND_KNOCKOUT',
          matchdayCount: Number(params.matchdayCount),
        }
      : null;

  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(linkedCompetition?.slug ?? null);

  // Re-syncs the selection on every fresh deep link (e.g. tapping "Rules"
  // from a different league than last time) — otherwise the useState above
  // only applies on this screen's very first mount, and a later navigation
  // to the same route with new params wouldn't override state that's
  // already set.
  useEffect(() => {
    if (linkedCompetition) setSelectedSlug(linkedCompetition.slug);
  }, [linkedCompetition?.slug]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      leaguesApi
        .mine(session.accessToken)
        .then(setLeagues)
        .catch(() => {
          // Rules should still render from the fallback/linked competition
          // even if this call fails — it only powers the competition
          // switcher, not the screen's core content.
        });
    }, [session]),
  );

  // Every distinct competition across the account's leagues, most recently
  // joined first (leaguesApi.mine()'s own order) — lets someone in more than
  // one switch which competition's rules they're looking at.
  const competitions = useMemo(() => {
    const seen = new Map<string, CompetitionSummary>();
    if (linkedCompetition) seen.set(linkedCompetition.slug, linkedCompetition);
    for (const league of leagues ?? []) {
      if (!seen.has(league.season.competition.slug)) {
        seen.set(league.season.competition.slug, league.season.competition);
      }
    }
    return [...seen.values()];
  }, [leagues, linkedCompetition]);

  const selected: CompetitionSummary =
    competitions.find((c) => c.slug === selectedSlug) ?? competitions[0] ?? linkedCompetition ?? FALLBACK_COMPETITION;

  const items: RuleItem[] =
    selected.structure === 'ROUND_ROBIN'
      ? [
          { title: t.rules.roundRobinIntro.title, body: t.rules.roundRobinIntro.body(selected.matchdayCount) },
          t.rules.missingPick,
          t.rules.teamCycleReset,
          t.rules.buyBack,
          t.rules.tieBreak,
        ]
      : [t.rules.groupAndKnockoutIntro, t.rules.missingPick, t.rules.knockoutLegs, t.rules.buyBack, t.rules.tieBreak];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          {t.rules.title}
        </ThemedText>

        {competitions.length > 1 && (
          <View style={styles.pickerBlock}>
            <ThemedText type="small" themeColor="textSecondary">
              {t.rules.competitionPickerLabel}
            </ThemedText>
            <View style={styles.competitionList}>
              {competitions.map((c) => (
                <Pressable
                  key={c.slug}
                  onPress={() => setSelectedSlug(c.slug)}
                  style={[
                    styles.competitionChip,
                    { borderColor: theme.border },
                    selected.slug === c.slug && [
                      styles.competitionChipSelected,
                      { borderColor: theme.primary, backgroundColor: theme.primary + '18' },
                    ],
                  ]}>
                  <ThemedText type="small" themeColor={selected.slug === c.slug ? 'text' : 'textSecondary'}>
                    {c.name}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {items.map((rule, i) => (
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
  pickerBlock: { gap: Spacing.one, alignItems: 'center' },
  competitionList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  competitionChip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  competitionChipSelected: { borderWidth: 2 },
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
