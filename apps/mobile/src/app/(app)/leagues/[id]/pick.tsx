import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  FixtureSummary,
  MatchdaySummary,
  MembershipStatus,
  PickOptionsResponse,
  TeamSummary,
} from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi, picksApi, seasonsApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { notify } from '@/utils/alerts';
import { goBackOrHome } from '@/utils/navigation';

/** The matchday open for picking: the earliest one that hasn't locked yet.
 * If every matchday has locked, the season is over — fall back to the last
 * one so there's still something sensible to show (read-only). */
function pickCurrentMatchday(matchdays: MatchdaySummary[]): MatchdaySummary | null {
  if (matchdays.length === 0) return null;
  const now = Date.now();
  const open = matchdays.find((m) => new Date(m.lockAt).getTime() > now);
  return open ?? matchdays[matchdays.length - 1];
}

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

export default function PickScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [matchday, setMatchday] = useState<MatchdaySummary | null>(null);
  const [options, setOptions] = useState<PickOptionsResponse | null>(null);
  const [myStatus, setMyStatus] = useState<MembershipStatus | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!session || !id) return;
    setIsLoading(true);
    setError(null);
    try {
      const league = await leaguesApi.getById(id, session.accessToken);
      setMyStatus(league.members.find((m) => m.userId === session.user.id)?.status ?? null);

      const matchdays = await seasonsApi.matchdays(league.season.id, session.accessToken);
      const current = pickCurrentMatchday(matchdays);
      setMatchday(current);
      if (!current) {
        setOptions(null);
        return;
      }

      const opts = await picksApi.pickOptions(id, current.id, session.accessToken);
      setOptions(opts);
      setSelectedTeamId(opts.currentPick?.teamId ?? null);
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

  const usedTeamIds = useMemo(() => new Set(options?.usedTeamIds ?? []), [options]);
  const isLocked = options ? new Date(options.lockAt).getTime() <= now : false;
  const isEliminated = myStatus === 'ELIMINATED';
  const canPick = !!options && !isLocked && !isEliminated;
  const hasChanged = selectedTeamId !== null && selectedTeamId !== (options?.currentPick?.teamId ?? null);

  async function handleSubmit() {
    if (!session || !id || !matchday || !selectedTeamId) return;
    setIsSubmitting(true);
    try {
      if (options?.currentPick) {
        await picksApi.changePick(id, matchday.id, selectedTeamId, session.accessToken);
      } else {
        await picksApi.submitPick(id, matchday.id, selectedTeamId, session.accessToken);
      }
      await load();
    } catch (err) {
      notify('Could not submit your pick', err instanceof ApiError ? err.message : undefined);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={goBackOrHome} style={styles.backButton}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : error ? (
          <>
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
            <Pressable onPress={load} style={styles.retryButton}>
              <ThemedText type="linkPrimary">Try again</ThemedText>
            </Pressable>
          </>
        ) : !matchday || !options ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText type="small" themeColor="textSecondary">
              No matchdays have been scheduled for this season yet.
            </ThemedText>
          </ThemedView>
        ) : (
          <>
            <ThemedText type="title" style={styles.title}>
              {matchday.roundLabel}
            </ThemedText>
            <ThemedText
              type="small"
              themeColor={isLocked ? 'textSecondary' : 'text'}
              style={styles.countdown}>
              {formatCountdown(options.lockAt, now)}
            </ThemedText>

            {isEliminated && (
              <ThemedText type="small" style={styles.bannerError}>
                You've been eliminated from this league and can no longer pick.
              </ThemedText>
            )}
            {!isEliminated && isLocked && (
              <ThemedText type="small" style={styles.bannerMuted}>
                Picks are locked for this matchday.
              </ThemedText>
            )}

            {options.fixtures.length === 0 ? (
              <ThemedView style={styles.emptyState}>
                <ThemedText type="small" themeColor="textSecondary">
                  Fixtures haven't been published for this matchday yet. Check back soon.
                </ThemedText>
              </ThemedView>
            ) : (
              <ThemedView style={styles.fixtureList}>
                {options.fixtures.map((fixture) => (
                  <FixtureRow
                    key={fixture.id}
                    fixture={fixture}
                    usedTeamIds={usedTeamIds}
                    selectedTeamId={selectedTeamId}
                    canPick={canPick}
                    onSelect={setSelectedTeamId}
                  />
                ))}
              </ThemedView>
            )}

            {canPick && (
              <Pressable
                onPress={handleSubmit}
                disabled={!hasChanged || isSubmitting}
                style={[styles.submitButton, (!hasChanged || isSubmitting) && styles.submitButtonDisabled]}>
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.submitButtonText}>
                    {options.currentPick ? 'Change Pick' : 'Submit Pick'}
                  </ThemedText>
                )}
              </Pressable>
            )}
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function FixtureRow({
  fixture,
  usedTeamIds,
  selectedTeamId,
  canPick,
  onSelect,
}: {
  fixture: FixtureSummary;
  usedTeamIds: Set<string>;
  selectedTeamId: string | null;
  canPick: boolean;
  onSelect: (teamId: string) => void;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.fixtureCard}>
      <TeamButton
        team={fixture.homeTeam}
        isUsed={usedTeamIds.has(fixture.homeTeam.id)}
        isSelected={selectedTeamId === fixture.homeTeam.id}
        canPick={canPick}
        onSelect={onSelect}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.vs}>
        vs
      </ThemedText>
      <TeamButton
        team={fixture.awayTeam}
        isUsed={usedTeamIds.has(fixture.awayTeam.id)}
        isSelected={selectedTeamId === fixture.awayTeam.id}
        canPick={canPick}
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
  onSelect,
}: {
  team: TeamSummary;
  isUsed: boolean;
  isSelected: boolean;
  canPick: boolean;
  onSelect: (teamId: string) => void;
}) {
  const disabled = !canPick || isUsed;
  return (
    <Pressable
      onPress={() => onSelect(team.id)}
      disabled={disabled}
      style={[
        styles.teamButton,
        isSelected && styles.teamButtonSelected,
        disabled && styles.teamButtonDisabled,
      ]}>
      <ThemedText
        type="smallBold"
        themeColor={isSelected ? 'text' : isUsed ? 'textSecondary' : 'text'}
        style={[isUsed && styles.teamNameUsed]}>
        {team.name}
      </ThemedText>
      {isUsed && (
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
  countdown: { textAlign: 'center', marginBottom: Spacing.two },
  bannerError: {
    color: '#e5484d',
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  bannerMuted: {
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  emptyState: { paddingVertical: Spacing.five, alignItems: 'center' },
  fixtureList: { gap: Spacing.two, paddingBottom: Spacing.three },
  fixtureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  vs: { flexShrink: 0 },
  teamButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#8888',
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    gap: Spacing.half,
  },
  teamButtonSelected: {
    borderColor: '#208AEF',
    borderWidth: 2,
  },
  teamButtonDisabled: {
    opacity: 0.5,
  },
  teamNameUsed: {
    textDecorationLine: 'line-through',
  },
  submitButton: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  retryButton: { alignSelf: 'center', marginTop: Spacing.two },
  error: { color: '#e5484d', textAlign: 'center' },
});
