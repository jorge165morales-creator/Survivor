import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PickHistoryEntry, PickOutcome } from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { picksApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { goBackOrHome } from '@/utils/navigation';

const OUTCOME_LABEL: Record<PickOutcome, string> = {
  PENDING: 'Pending',
  WIN: 'Win',
  DRAW_FORGIVEN: 'Draw (forgiven)',
  DRAW_ELIMINATED: 'Draw (eliminated)',
  LOSS: 'Loss',
};

export default function PickHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [entries, setEntries] = useState<PickHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session || !id) return;
    setError(null);
    picksApi
      .myPicks(id, session.accessToken)
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your pick history.'));
  }, [session, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!session) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={goBackOrHome} style={styles.backButton}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        <ThemedText type="title" style={styles.title}>
          Your Picks
        </ThemedText>

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        {!entries ? (
          <ActivityIndicator style={styles.loading} />
        ) : entries.length === 0 ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText type="small" themeColor="textSecondary">
              You haven't made any picks yet.
            </ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => `${item.matchdaySequence}`}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <HistoryRow entry={item} />}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function HistoryRow({ entry }: { entry: PickHistoryEntry }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedView style={styles.rowMain}>
        <ThemedText type="smallBold">{entry.roundLabel}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {entry.team.name}
        </ThemedText>
      </ThemedView>
      <ThemedText type="small" style={outcomeStyle(entry.outcome)}>
        {OUTCOME_LABEL[entry.outcome]}
      </ThemedText>
    </ThemedView>
  );
}

function outcomeStyle(outcome: PickOutcome) {
  switch (outcome) {
    case 'WIN':
    case 'DRAW_FORGIVEN':
      return styles.outcomeGood;
    case 'LOSS':
    case 'DRAW_ELIMINATED':
      return styles.outcomeBad;
    default:
      return styles.outcomeNeutral;
  }
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
  loading: { marginTop: Spacing.five },
  title: { textAlign: 'center', marginBottom: Spacing.two },
  emptyState: { paddingVertical: Spacing.five, alignItems: 'center' },
  list: { gap: Spacing.one, paddingBottom: Spacing.three },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowMain: { gap: Spacing.half },
  outcomeGood: { color: '#2f9e44' },
  outcomeBad: { color: '#e5484d' },
  outcomeNeutral: { color: '#60646C' },
  error: { color: '#e5484d', textAlign: 'center' },
});
