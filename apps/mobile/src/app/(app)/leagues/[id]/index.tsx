import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LeagueDetail, LeagueMemberSummary } from '@survivor/shared-types';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { confirmAsync, notify } from '@/utils/alerts';
import { goBackOrHome } from '@/utils/navigation';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

export default function LeagueDetailScreen() {
  const theme = useTheme();
  const { t } = useLocale();
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
      .catch((err) => setError(err instanceof ApiError ? err.message : t.leagueDetail.couldNotLoad));
  }, [session, id, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleShare() {
    if (!session || !id) return;
    try {
      const { inviteCode } = await leaguesApi.inviteLink(id, session.accessToken);
      await Share.share({ message: t.leagueDetail.shareMessage(inviteCode) });
    } catch (err) {
      notify(t.leagueDetail.couldNotCreateInviteLink, err instanceof ApiError ? err.message : undefined);
    }
  }

  async function handleTogglePaid(userId: string, hasPaid: boolean) {
    if (!session || !id) return;
    setTogglingUserId(userId);
    try {
      await leaguesApi.markPaid(id, userId, hasPaid, session.accessToken);
      load();
    } catch (err) {
      notify(t.leagueDetail.couldNotUpdatePayment, err instanceof ApiError ? err.message : undefined);
    } finally {
      setTogglingUserId(null);
    }
  }

  async function handleLeave() {
    if (!session || !id) return;
    const confirmed = await confirmAsync(
      t.leagueDetail.leaveConfirmTitle,
      t.leagueDetail.leaveConfirmMessage,
      t.leagueDetail.leaveConfirmLabel,
    );
    if (!confirmed) return;

    setIsLeaving(true);
    try {
      await leaguesApi.leave(id, session.accessToken);
      router.replace('/');
    } catch (err) {
      notify(t.leagueDetail.couldNotLeave, err instanceof ApiError ? err.message : undefined);
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
          <ThemedText type="linkPrimary">{t.common.back}</ThemedText>
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
              {t.leagueDetail.seasonAndInvite(league.season.name, league.inviteCode)}
            </ThemedText>

            <GradientButton style={styles.pickButton} onPress={() => router.push(`/leagues/${id}/pick`)}>
              {t.leagueDetail.makePick}
            </GradientButton>

            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.actionButtonSecondary, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                onPress={() => router.push(`/leagues/${id}/standings`)}>
                <ThemedText style={styles.actionButtonSecondaryText}>{t.leagueDetail.standings}</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.actionButtonSecondary, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                onPress={() => router.push(`/leagues/${id}/history`)}>
                <ThemedText style={styles.actionButtonSecondaryText}>{t.leagueDetail.history}</ThemedText>
              </Pressable>
            </View>

            <Pressable style={styles.rulesButton} onPress={() => router.push('/rules')}>
              <ThemedText type="linkPrimary">{t.leagueDetail.rules}</ThemedText>
            </Pressable>

            {myStatus === 'ELIMINATED' && (
              <ThemedText type="small" style={[styles.eliminatedBanner, { color: theme.danger }]}>
                {t.leagueDetail.eliminatedBanner}
              </ThemedText>
            )}

            <Pressable
              onPress={handleShare}
              style={[styles.shareButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.shareButtonText}>{t.leagueDetail.shareInvite}</ThemedText>
            </Pressable>

            <ThemedText type="smallBold" style={styles.membersHeading}>
              {t.leagueDetail.membersHeading(league.members.length, league.maxMembers)}
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
                  <ThemedText style={[styles.leaveButtonText, { color: theme.danger }]}>{t.leagueDetail.leaveLeague}</ThemedText>
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
  const { t } = useLocale();
  const awaitingPayment = paymentRequired && !member.hasPaid;
  const statusColor = awaitingPayment
    ? theme.buyBack
    : member.status === 'ACTIVE'
      ? theme.success
      : member.status === 'ELIMINATED'
        ? theme.danger
        : theme.textSecondary;
  const statusLabel = awaitingPayment
    ? t.status.awaitingPayment
    : member.status === 'ACTIVE'
      ? t.status.alive
      : member.status === 'ELIMINATED'
        ? t.status.eliminated
        : t.status.left;

  return (
    <ThemedView type="backgroundElement" style={[styles.memberRow, { borderColor: theme.border }]}>
      <ThemedText type="small">
        {member.displayName}
        {member.isCommissioner ? t.leagueDetail.adminTag : ''}
      </ThemedText>
      <View style={styles.memberRowRight}>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
          <ThemedText type="small" style={[styles.statusPillText, { color: statusColor }]}>
            {statusLabel}
          </ThemedText>
        </View>
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
      </View>
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
  pickButton: { marginBottom: Spacing.two },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  actionButtonSecondary: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  actionButtonSecondaryText: { fontFamily: 'Outfit_700Bold', fontSize: 15 },
  rulesButton: { alignItems: 'center', paddingVertical: Spacing.one },
  eliminatedBanner: {
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  shareButton: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  shareButtonText: { fontFamily: 'Outfit_700Bold', fontSize: 15 },
  membersHeading: { marginBottom: Spacing.one },
  list: { gap: Spacing.one, paddingBottom: Spacing.three },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  memberRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusPill: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  statusPillText: { fontFamily: 'Outfit_700Bold', fontSize: 12 },
  leaveButton: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  leaveButtonText: { fontFamily: 'Outfit_700Bold', fontSize: 15 },
  error: { textAlign: 'center' },
});
