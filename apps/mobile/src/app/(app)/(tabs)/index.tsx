import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LeagueSummary } from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { leaguesApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';

export default function LeagueListScreen() {
  const { session, signOut } = useSession();
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    setError(null);
    leaguesApi
      .mine(session.accessToken)
      .then(setLeagues)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your leagues.'))
      .finally(() => setIsRefreshing(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function handleRefresh() {
    setIsRefreshing(true);
    load();
  }

  function handleSignOut() {
    signOut();
    router.replace('/sign-in');
  }

  if (!session) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="subtitle">Hi, {session.user.displayName}</ThemedText>
          <Pressable onPress={handleSignOut}>
            <ThemedText type="linkPrimary">Sign Out</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.actionsRow}>
          <Pressable style={styles.actionButton} onPress={() => router.push('/leagues/create')}>
            <ThemedText style={styles.actionButtonText}>+ Create League</ThemedText>
          </Pressable>
          <Pressable style={styles.actionButtonSecondary} onPress={() => router.push('/leagues/join')}>
            <ThemedText style={styles.actionButtonSecondaryText}>Join League</ThemedText>
          </Pressable>
        </ThemedView>

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        {leagues === null ? (
          <ActivityIndicator style={styles.loading} />
        ) : leagues.length === 0 ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText type="small" themeColor="textSecondary">
              You&apos;re not in any leagues yet. Create one or join a friend&apos;s with an invite code.
            </ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={leagues}
            keyExtractor={(item) => item.id}
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <LeagueCard league={item} />}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function LeagueCard({ league }: { league: LeagueSummary }) {
  return (
    <Pressable onPress={() => router.push(`/leagues/${league.id}`)}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{league.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {league.season.name} · {league.memberCount}/{league.maxMembers} members
        </ThemedText>
        <ThemedText type="small" style={statusStyle(league.myStatus)}>
          {league.myStatus === 'ACTIVE' ? 'Alive' : league.myStatus === 'ELIMINATED' ? 'Eliminated' : ''}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function statusStyle(status: LeagueSummary['myStatus']) {
  return status === 'ACTIVE' ? styles.statusAlive : styles.statusEliminated;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingBottom: BottomTabInset,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  actionButtonText: { color: '#fff', fontWeight: '600' },
  actionButtonSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#8888',
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  actionButtonSecondaryText: { fontWeight: '600' },
  loading: { marginTop: Spacing.five },
  emptyState: { paddingVertical: Spacing.five, alignItems: 'center' },
  list: { gap: Spacing.two, paddingBottom: Spacing.four },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  statusAlive: { color: '#2f9e44' },
  statusEliminated: { color: '#e5484d' },
  error: { color: '#e5484d', textAlign: 'center' },
});
