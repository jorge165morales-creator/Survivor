import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PickHistoryEntry, PickOutcome } from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { picksApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { goBackOrHome } from '@/utils/navigation';
import { useTheme } from '@/hooks/use-theme';

const OUTCOME_LABEL: Record<PickOutcome, string> = {
  PENDING: 'Pending',
  WIN: 'Win',
  DRAW: 'Draw',
  LOSS: 'Loss',
};

export default function PickHistoryScreen() {
  const theme = useTheme();
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
          <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
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
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.row, { borderColor: theme.border }]}>
      {entry.team.crestUrl && (
        <Image source={{ uri: entry.team.crestUrl }} style={styles.crest} contentFit="contain" />
      )}
      <ThemedView style={styles.rowMain}>
        <ThemedText type="smallBold">{entry.roundLabel}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {entry.team.name}
        </ThemedText>
      </ThemedView>
      <ThemedText type="small" style={{ color: outcomeColor(entry.outcome, theme) }}>
        {OUTCOME_LABEL[entry.outcome]}
      </ThemedText>
    </ThemedView>
  );
}

function outcomeColor(outcome: PickOutcome, theme: ReturnType<typeof useTheme>) {
  switch (outcome) {
    case 'WIN':
    case 'DRAW':
      return theme.success;
    case 'LOSS':
      return theme.danger;
    default:
      return theme.textSecondary;
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
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  rowMain: { flex: 1, gap: Spacing.half },
  crest: { width: 40, height: 45 },
  error: { textAlign: 'center' },
});
