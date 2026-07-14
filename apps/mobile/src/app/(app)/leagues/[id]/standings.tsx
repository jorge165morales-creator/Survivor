import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StandingsEntry } from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { standingsApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { goBackOrHome } from '@/utils/navigation';

export default function StandingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [entries, setEntries] = useState<StandingsEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session || !id) return;
    setError(null);
    standingsApi
      .get(id, session.accessToken)
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load standings.'));
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
          Standings
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
              No members in this league yet.
            </ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => <StandingsRow entry={item} rank={index + 1} />}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function StandingsRow({ entry, rank }: { entry: StandingsEntry; rank: number }) {
  const isAlive = entry.status === 'ACTIVE';
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rank}>
        {rank}
      </ThemedText>
      <ThemedView style={styles.rowMain}>
        <ThemedText type="smallBold">{entry.displayName}</ThemedText>
        {entry.tieForgivenessUsed && (
          <ThemedText type="small" themeColor="textSecondary">
            Tie forgiveness used
          </ThemedText>
        )}
      </ThemedView>
      <ThemedText type="small" style={isAlive ? styles.statusAlive : styles.statusEliminated}>
        {isAlive
          ? 'Alive'
          : entry.eliminatedAtMatchdaySequence
            ? `Out — MD${entry.eliminatedAtMatchdaySequence}`
            : 'Eliminated'}
      </ThemedText>
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
  loading: { marginTop: Spacing.five },
  title: { textAlign: 'center', marginBottom: Spacing.two },
  emptyState: { paddingVertical: Spacing.five, alignItems: 'center' },
  list: { gap: Spacing.one, paddingBottom: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  rank: { width: 24 },
  rowMain: { flex: 1, gap: Spacing.half },
  statusAlive: { color: '#2f9e44' },
  statusEliminated: { color: '#e5484d' },
  error: { color: '#e5484d', textAlign: 'center' },
});
