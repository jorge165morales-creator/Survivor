import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, Share, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LeagueDetail, LeagueMemberSummary } from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { confirmAsync, notify } from '@/utils/alerts';
import { goBackOrHome } from '@/utils/navigation';

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const load = useCallback(() => {
    if (!session || !id) return;
    leaguesApi
      .getById(id, session.accessToken)
      .then(setLeague)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this league.'));
  }, [session, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleShare() {
    if (!session || !id) return;
    try {
      const { url, inviteCode } = await leaguesApi.inviteLink(id, session.accessToken);
      await Share.share({ message: `Join my Survivor league! Invite code: ${inviteCode}\n${url}` });
    } catch (err) {
      notify('Could not create invite link', err instanceof ApiError ? err.message : undefined);
    }
  }

  async function handleLeave() {
    if (!session || !id) return;
    const confirmed = await confirmAsync(
      'Leave league?',
      'You can rejoin later with the invite code.',
      'Leave',
    );
    if (!confirmed) return;

    setIsLeaving(true);
    try {
      await leaguesApi.leave(id, session.accessToken);
      router.replace('/');
    } catch (err) {
      notify('Could not leave league', err instanceof ApiError ? err.message : undefined);
    } finally {
      setIsLeaving(false);
    }
  }

  if (!session) {
    return null;
  }

  const isCommissioner = league?.commissionerId === session.user.id;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={goBackOrHome} style={styles.backButton}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        {!league ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <>
            <ThemedText type="title" style={styles.title}>
              {league.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {league.season.name} · Invite code: {league.inviteCode}
            </ThemedText>

            <Pressable onPress={handleShare} style={styles.shareButton}>
              <ThemedText style={styles.shareButtonText}>Share Invite</ThemedText>
            </Pressable>

            <ThemedText type="smallBold" style={styles.membersHeading}>
              Members ({league.members.length}/{league.maxMembers})
            </ThemedText>
            <FlatList
              data={league.members}
              keyExtractor={(m) => m.userId}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => <MemberRow member={item} />}
            />

            {!isCommissioner && (
              <Pressable onPress={handleLeave} disabled={isLeaving} style={styles.leaveButton}>
                {isLeaving ? <ActivityIndicator /> : <ThemedText style={styles.leaveButtonText}>Leave League</ThemedText>}
              </Pressable>
            )}
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function MemberRow({ member }: { member: LeagueMemberSummary }) {
  return (
    <ThemedView type="backgroundElement" style={styles.memberRow}>
      <ThemedText type="small">
        {member.displayName}
        {member.isCommissioner ? ' (Commissioner)' : ''}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {member.status === 'ACTIVE' ? 'Alive' : member.status === 'ELIMINATED' ? 'Eliminated' : 'Left'}
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
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginBottom: Spacing.two },
  shareButton: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  shareButtonText: { color: '#fff', fontWeight: '600' },
  membersHeading: { marginBottom: Spacing.one },
  list: { gap: Spacing.one, paddingBottom: Spacing.three },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  leaveButton: {
    borderWidth: 1,
    borderColor: '#e5484d',
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  leaveButtonText: { color: '#e5484d', fontWeight: '600' },
  error: { color: '#e5484d', textAlign: 'center' },
});
