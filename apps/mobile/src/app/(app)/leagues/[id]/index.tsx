import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, Share, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LeagueDetail, LeagueMemberSummary } from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { confirmAsync, notify } from '@/utils/alerts';
import { goBackOrHome } from '@/utils/navigation';
import { useTheme } from '@/hooks/use-theme';

export default function LeagueDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

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

  async function handleTogglePaid(userId: string, hasPaid: boolean) {
    if (!session || !id) return;
    setTogglingUserId(userId);
    try {
      await leaguesApi.markPaid(id, userId, hasPaid, session.accessToken);
      load();
    } catch (err) {
      notify('Could not update payment status', err instanceof ApiError ? err.message : undefined);
    } finally {
      setTogglingUserId(null);
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
  const myStatus = league?.members.find((m) => m.userId === session.user.id)?.status;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={goBackOrHome} style={styles.backButton}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        {error && (
          <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
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

            <ThemedView style={styles.actionsRow}>
              <Pressable
                style={[styles.actionButton, { backgroundColor: theme.primary }]}
                onPress={() => router.push(`/leagues/${id}/pick`)}>
                <ThemedText style={styles.actionButtonText}>Make Pick</ThemedText>
              </Pressable>
              <Pressable
                style={styles.actionButtonSecondary}
                onPress={() => router.push(`/leagues/${id}/standings`)}>
                <ThemedText style={styles.actionButtonSecondaryText}>Standings</ThemedText>
              </Pressable>
              <Pressable
                style={styles.actionButtonSecondary}
                onPress={() => router.push(`/leagues/${id}/history`)}>
                <ThemedText style={styles.actionButtonSecondaryText}>History</ThemedText>
              </Pressable>
            </ThemedView>

            <Pressable
              style={styles.rulesButton}
              onPress={() => router.push(`/leagues/${id}/rules`)}>
              <ThemedText type="linkPrimary">Rules</ThemedText>
            </Pressable>

            {myStatus === 'ELIMINATED' && (
              <ThemedText type="small" style={[styles.eliminatedBanner, { color: theme.danger }]}>
                You've been eliminated from this league.
              </ThemedText>
            )}

            <Pressable onPress={handleShare} style={[styles.shareButton, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.shareButtonText}>Share Invite</ThemedText>
            </Pressable>

            <ThemedText type="smallBold" style={styles.membersHeading}>
              Members ({league.members.length}/{league.maxMembers})
            </ThemedText>
            <FlatList
              data={league.members}
              keyExtractor={(m) => m.userId}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <MemberRow
                  member={item}
                  paymentRequired={league.paymentRequired}
                  canTogglePaid={isCommissioner && !item.isCommissioner}
                  isToggling={togglingUserId === item.userId}
                  onTogglePaid={(hasPaid) => handleTogglePaid(item.userId, hasPaid)}
                />
              )}
            />

            {!isCommissioner && (
              <Pressable
                onPress={handleLeave}
                disabled={isLeaving}
                style={[styles.leaveButton, { borderColor: theme.danger }]}>
                {isLeaving ? (
                  <ActivityIndicator />
                ) : (
                  <ThemedText style={[styles.leaveButtonText, { color: theme.danger }]}>Leave League</ThemedText>
                )}
              </Pressable>
            )}
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function MemberRow({
  member,
  paymentRequired,
  canTogglePaid,
  isToggling,
  onTogglePaid,
}: {
  member: LeagueMemberSummary;
  paymentRequired: boolean;
  canTogglePaid: boolean;
  isToggling: boolean;
  onTogglePaid: (hasPaid: boolean) => void;
}) {
  const theme = useTheme();
  const awaitingPayment = paymentRequired && !member.hasPaid;

  return (
    <ThemedView type="backgroundElement" style={styles.memberRow}>
      <ThemedText type="small">
        {member.displayName}
        {member.isCommissioner ? ' (Commissioner)' : ''}
      </ThemedText>
      <ThemedView style={styles.memberRowRight}>
        <ThemedText type="small" style={{ color: awaitingPayment ? theme.buyBack : theme.textSecondary }}>
          {awaitingPayment
            ? 'Awaiting payment'
            : member.status === 'ACTIVE'
              ? 'Alive'
              : member.status === 'ELIMINATED'
                ? 'Eliminated'
                : 'Left'}
        </ThemedText>
        {paymentRequired && canTogglePaid && (
          isToggling ? (
            <ActivityIndicator size="small" />
          ) : (
            <Switch
              value={member.hasPaid}
              onValueChange={onTogglePaid}
              trackColor={{ true: theme.buyBack }}
            />
          )
        )}
      </ThemedView>
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
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  actionButton: {
    flex: 1,
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
  rulesButton: { alignItems: 'center', paddingVertical: Spacing.one },
  eliminatedBanner: {
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  shareButton: {
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
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  memberRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  leaveButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  leaveButtonText: { fontWeight: '600' },
  error: { textAlign: 'center' },
});
