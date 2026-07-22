import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  FixtureSummary,
  MatchdaySummary,
  MembershipStatus,
  PickOptionsResponse,
  PickOutcome,
  TeamSummary,
} from '@survivor/shared-types';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi, picksApi, seasonsApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { notify } from '@/utils/alerts';
import { goBackOrHome } from '@/utils/navigation';
import { syncPickReminder } from '@/utils/notifications';
import { useTheme } from '@/hooks/use-theme';

function formatCountdown(lockAt: string, now: number): string {
  const diffMs = new Date(lockAt).getTime() - now;
  if (diffMs <= 0) return 'Locked';
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Locks in ${days}d ${hours}h`;
  if (hours > 0) return `Locks in ${hours}h ${minutes}m`;
  return `Locks in ${minutes}m`;
}

/** Win-or-draw-survives outcome for a resolved pick, derived client-side from
 * the fixture result — mirrors apps/api/src/game-engine/survival.service.ts
 * without needing a separate round trip. */
function computeOutcome(pickedTeamId: string, fixture: FixtureSummary): PickOutcome {
  if (!fixture.result) return 'PENDING';
  if (fixture.result === 'DRAW') return 'DRAW';
  const pickedHome = fixture.homeTeam.id === pickedTeamId;
  const won = (fixture.result === 'HOME_WIN' && pickedHome) || (fixture.result === 'AWAY_WIN' && !pickedHome);
  return won ? 'WIN' : 'LOSS';
}

const OUTCOME_LABEL: Record<PickOutcome, string> = {
  PENDING: 'Picked',
  WIN: 'Won',
  DRAW: 'Drew',
  LOSS: 'Lost',
};

type MatchdayEntry = { matchday: MatchdaySummary; options: PickOptionsResponse };

export default function PickScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [entries, setEntries] = useState<MatchdayEntry[] | null>(null);
  const [myStatus, setMyStatus] = useState<MembershipStatus | null>(null);
  const [isUnpaid, setIsUnpaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!session || !id) return;
    setIsLoading(true);
    setError(null);
    try {
      const league = await leaguesApi.getById(id, session.accessToken);
      const myMembership = league.members.find((m) => m.userId === session.user.id);
      const isEliminated = myMembership?.status === 'ELIMINATED';
      const isUnpaid = league.paymentRequired && !(myMembership?.hasPaid ?? false);
      setMyStatus(myMembership?.status ?? null);
      setIsUnpaid(isUnpaid);

      const matchdays = await seasonsApi.matchdays(league.season.id, session.accessToken);
      const optionsList = await Promise.all(
        matchdays.map((md) => picksApi.pickOptions(id, md.id, session.accessToken)),
      );
      setEntries(matchdays.map((matchday, i) => ({ matchday, options: optionsList[i] })));

      // Best-effort: a reminder 3h before lock for any matchday that's still
      // pickable and has no pick submitted yet. Cancels/reschedules on every
      // load, so it stays in sync with picks made and fixture corrections.
      for (const [i, matchday] of matchdays.entries()) {
        const options = optionsList[i];
        void syncPickReminder({
          leagueId: id,
          leagueName: league.name,
          matchdayId: matchday.id,
          roundLabel: matchday.roundLabel,
          lockAt: options.lockAt,
          shouldRemind: !isEliminated && !isUnpaid && !options.currentPick,
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the pick screen.');
    } finally {
      setIsLoading(false);
    }
  }, [session, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const isEliminated = myStatus === 'ELIMINATED';

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
          Make Your Picks
        </ThemedText>

        {isEliminated && (
          <ThemedView style={[styles.banner, { backgroundColor: theme.danger + '18', borderColor: theme.danger + '44' }]}>
            <ThemedText type="small" style={[styles.bannerText, { color: theme.danger }]}>
              You've been eliminated from this league and can no longer pick.
            </ThemedText>
          </ThemedView>
        )}
        {!isEliminated && isUnpaid && (
          <ThemedView style={[styles.banner, { backgroundColor: theme.buyBack + '18', borderColor: theme.buyBack + '44' }]}>
            <ThemedText type="small" style={[styles.bannerText, { color: theme.buyBack }]}>
              Waiting for the admin to confirm your payment before you can pick. You can still browse the
              teams below.
            </ThemedText>
          </ThemedView>
        )}

        {isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : error ? (
          <>
            <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
              {error}
            </ThemedText>
            <Pressable onPress={load} style={styles.retryButton}>
              <ThemedText type="linkPrimary">Try again</ThemedText>
            </Pressable>
          </>
        ) : !entries || entries.length === 0 ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText type="small" themeColor="textSecondary">
              No matchdays have been scheduled for this season yet.
            </ThemedText>
          </ThemedView>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {entries.map((entry) => (
              <MatchdaySection
                key={entry.matchday.id}
                leagueId={id}
                entry={entry}
                isEliminated={isEliminated}
                isUnpaid={isUnpaid}
                now={now}
                onChanged={load}
              />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function MatchdaySection({
  leagueId,
  entry,
  isEliminated,
  isUnpaid,
  now,
  onChanged,
}: {
  leagueId: string;
  entry: MatchdayEntry;
  isEliminated: boolean;
  isUnpaid: boolean;
  now: number;
  onChanged: () => Promise<void>;
}) {
  const theme = useTheme();
  const { session } = useSession();
  const { matchday, options } = entry;
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(options.currentPick?.teamId ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedTeamId(options.currentPick?.teamId ?? null);
  }, [options.currentPick?.teamId]);

  const usedTeamIds = useMemo(() => new Set(options.usedTeamIds), [options.usedTeamIds]);
  const isLocked = new Date(options.lockAt).getTime() <= now;
  const canPick = !isLocked && !isEliminated && !isUnpaid;
  const hasChanged = selectedTeamId !== null && selectedTeamId !== (options.currentPick?.teamId ?? null);
  const hasNoEligibleTeams =
    !options.currentPick &&
    options.fixtures.length > 0 &&
    options.fixtures.every((f) => usedTeamIds.has(f.homeTeam.id) && usedTeamIds.has(f.awayTeam.id));

  const pickedFixture = options.currentPick
    ? options.fixtures.find(
        (f) => f.homeTeam.id === options.currentPick!.teamId || f.awayTeam.id === options.currentPick!.teamId,
      )
    : null;
  const resolvedOutcome =
    isLocked && options.currentPick && pickedFixture
      ? computeOutcome(options.currentPick.teamId, pickedFixture)
      : null;

  async function handleSubmit() {
    if (!session || !selectedTeamId) return;
    setIsSubmitting(true);
    try {
      if (options.currentPick) {
        await picksApi.changePick(leagueId, matchday.id, selectedTeamId, session.accessToken);
      } else {
        await picksApi.submitPick(leagueId, matchday.id, selectedTeamId, session.accessToken);
      }
      await onChanged();
    } catch (err) {
      notify('Could not submit your pick', err instanceof ApiError ? err.message : undefined);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.section}>
      <ThemedView style={styles.sectionHeader}>
        <ThemedText type="smallBold">{matchday.roundLabel}</ThemedText>
        <ThemedText
          type="small"
          style={
            resolvedOutcome
              ? { color: resolvedOutcome === 'LOSS' ? theme.danger : theme.success }
              : { color: isLocked ? theme.textSecondary : theme.text }
          }>
          {resolvedOutcome ? OUTCOME_LABEL[resolvedOutcome] : formatCountdown(options.lockAt, now)}
        </ThemedText>
      </ThemedView>

      {canPick && hasNoEligibleTeams && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          You've already used every team playing this matchday — you have no valid pick and will be
          eliminated when it locks.
        </ThemedText>
      )}

      {options.fixtures.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.noFixtures}>
          Fixtures haven't been published for this matchday yet.
        </ThemedText>
      ) : (
        options.fixtures.map((fixture) => (
          <FixtureRow
            key={fixture.id}
            fixture={fixture}
            usedTeamIds={usedTeamIds}
            selectedTeamId={selectedTeamId}
            canPick={canPick}
            highlightColor={resolvedOutcome ? (resolvedOutcome === 'LOSS' ? theme.danger : theme.success) : undefined}
            onSelect={setSelectedTeamId}
          />
        ))
      )}

      {canPick && options.fixtures.length > 0 && (
        <GradientButton onPress={handleSubmit} disabled={!hasChanged} isLoading={isSubmitting} style={styles.submitButton}>
          {options.currentPick ? 'Change Pick' : 'Submit Pick'}
        </GradientButton>
      )}
    </ThemedView>
  );
}

function FixtureRow({
  fixture,
  usedTeamIds,
  selectedTeamId,
  canPick,
  highlightColor,
  onSelect,
}: {
  fixture: FixtureSummary;
  usedTeamIds: Set<string>;
  selectedTeamId: string | null;
  canPick: boolean;
  highlightColor?: string;
  onSelect: (teamId: string) => void;
}) {
  const score =
    fixture.homeScore !== null && fixture.awayScore !== null ? `${fixture.homeScore}–${fixture.awayScore}` : 'vs';
  return (
    <ThemedView style={styles.fixtureCard}>
      <TeamButton
        team={fixture.homeTeam}
        isUsed={usedTeamIds.has(fixture.homeTeam.id)}
        isSelected={selectedTeamId === fixture.homeTeam.id}
        canPick={canPick}
        highlightColor={selectedTeamId === fixture.homeTeam.id ? highlightColor : undefined}
        onSelect={onSelect}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.vs}>
        {score}
      </ThemedText>
      <TeamButton
        team={fixture.awayTeam}
        isUsed={usedTeamIds.has(fixture.awayTeam.id)}
        isSelected={selectedTeamId === fixture.awayTeam.id}
        canPick={canPick}
        highlightColor={selectedTeamId === fixture.awayTeam.id ? highlightColor : undefined}
        onSelect={onSelect}
      />
    </ThemedView>
  );
}

function TeamButton({
  team,
  isUsed,
  isSelected,
  canPick,
  highlightColor,
  onSelect,
}: {
  team: TeamSummary;
  isUsed: boolean;
  isSelected: boolean;
  canPick: boolean;
  highlightColor?: string;
  onSelect: (teamId: string) => void;
}) {
  const theme = useTheme();
  const disabled = !canPick || isUsed;
  const borderColor = highlightColor ?? (isSelected ? theme.primary : theme.border);
  return (
    <Pressable
      onPress={() => onSelect(team.id)}
      disabled={disabled}
      style={[
        styles.teamButton,
        { borderColor, backgroundColor: theme.backgroundElement },
        (highlightColor || isSelected) && styles.teamButtonSelected,
        disabled && !highlightColor && !isSelected && styles.teamButtonDisabled,
      ]}>
      {team.crestUrl && (
        <Image source={{ uri: team.crestUrl }} style={styles.crest} contentFit="contain" />
      )}
      <ThemedText
        type="smallBold"
        themeColor={isSelected ? 'text' : isUsed ? 'textSecondary' : 'text'}
        style={[isUsed && !isSelected && styles.teamNameUsed]}
        numberOfLines={1}>
        {team.name}
      </ThemedText>
      {isUsed && !isSelected && (
        <ThemedText type="small" themeColor="textSecondary">
          Already used
        </ThemedText>
      )}
    </Pressable>
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
  banner: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: Spacing.three,
  },
  bannerText: {
    textAlign: 'center',
  },
  emptyState: { paddingVertical: Spacing.five, alignItems: 'center' },
  scrollContent: { gap: Spacing.three, paddingBottom: Spacing.five },
  section: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noFixtures: { paddingVertical: Spacing.two },
  fixtureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  vs: { flexShrink: 0, width: 36, textAlign: 'center' },
  teamButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    gap: Spacing.half,
  },
  teamButtonSelected: {
    borderWidth: 2,
  },
  teamButtonDisabled: {
    opacity: 0.5,
  },
  teamNameUsed: {
    textDecorationLine: 'line-through',
  },
  crest: {
    width: 44,
    height: 50,
  },
  submitButton: { marginTop: Spacing.two },
  retryButton: { alignSelf: 'center', marginTop: Spacing.two },
  error: { textAlign: 'center' },
});
