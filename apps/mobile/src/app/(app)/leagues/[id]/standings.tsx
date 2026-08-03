import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StandingsGridCell, StandingsGridMatchday, StandingsGridRow } from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi, standingsApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { goBackOrHome } from '@/utils/navigation';
import { confirmAsync, notify } from '@/utils/alerts';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

const NAME_COL_WIDTH = 136;
const CELL_COL_WIDTH = 60;
const HEADER_ROW_HEIGHT = 40;
const DATA_ROW_HEIGHT = 76;

const ROUND_ABBREVIATIONS: Record<string, string> = {
  'Knockout Playoffs': 'KOP',
  'Round of 16': 'R16',
  Quarterfinals: 'QF',
  Semifinals: 'SF',
  Final: 'F',
};

/** Squeezes a matchday's full roundLabel ("League Phase Matchday 3",
 * "Round of 16 — Leg 2") down to something that fits a ~60px column header. */
function shortMatchdayLabel(matchday: StandingsGridMatchday): string {
  const groupMatch = matchday.roundLabel.match(/^League Phase Matchday (\d+)$/);
  if (groupMatch) return `MD${groupMatch[1]}`;

  const legMatch = matchday.roundLabel.match(/^(.+?) — Leg (\d)$/);
  const base = legMatch ? legMatch[1] : matchday.roundLabel;
  const leg = legMatch ? legMatch[2] : null;
  const short = ROUND_ABBREVIATIONS[base] ?? base.slice(0, 3).toUpperCase();
  return leg ? `${short}·${leg}` : short;
}

export default function StandingsScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [matchdays, setMatchdays] = useState<StandingsGridMatchday[] | null>(null);
  const [rows, setRows] = useState<StandingsGridRow[] | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [buyBackEnabled, setBuyBackEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantingUserId, setGrantingUserId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    cell: StandingsGridCell;
    playerName: string;
    roundLabel: string;
  } | null>(null);

  const load = useCallback(() => {
    if (!session || !id) return;
    setError(null);
    Promise.all([standingsApi.grid(id, session.accessToken), leaguesApi.getById(id, session.accessToken)])
      .then(([grid, league]) => {
        setMatchdays(grid.matchdays);
        setRows(grid.rows);
        setIsCommissioner(league.commissionerId === session.user.id);
        setBuyBackEnabled(league.buyBackEnabled);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t.standings.couldNotLoad));
  }, [session, id, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleGrantBuyBack(userId: string, playerName: string) {
    if (!session || !id) return;
    const confirmed = await confirmAsync(
      t.standings.grantBuyBackConfirmTitle,
      t.standings.grantBuyBackConfirmMessage(playerName),
      t.standings.grantBuyBackConfirmLabel,
    );
    if (!confirmed) return;

    setGrantingUserId(userId);
    try {
      await leaguesApi.grantBuyBack(id, userId, session.accessToken);
      load();
    } catch (err) {
      notify(t.standings.couldNotGrantBuyBack, err instanceof ApiError ? err.message : undefined);
    } finally {
      setGrantingUserId(null);
    }
  }

  if (!session) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={goBackOrHome} style={styles.backButton}>
          <ThemedText type="linkPrimary">{t.common.back}</ThemedText>
        </Pressable>

        <ThemedText type="title" style={styles.title}>
          {t.standings.title}
        </ThemedText>

        {error && (
          <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
            {error}
          </ThemedText>
        )}

        {!rows || !matchdays ? (
          <ActivityIndicator style={styles.loading} />
        ) : rows.length === 0 ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText type="small" themeColor="textSecondary">
              {t.standings.emptyState}
            </ThemedText>
          </ThemedView>
        ) : (
          <>
            <Legend />
            <ScrollView contentContainerStyle={styles.verticalScroll}>
              <View style={styles.gridRow}>
                <View style={{ width: NAME_COL_WIDTH }}>
                  <View style={[styles.nameCell, styles.headerCell]}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t.standings.playerColumn}
                    </ThemedText>
                  </View>
                  {rows.map((row) => (
                    <NameCell
                      key={row.userId}
                      row={row}
                      canGrantBuyBack={isCommissioner && buyBackEnabled}
                      isGranting={grantingUserId === row.userId}
                      onGrantBuyBack={() => handleGrantBuyBack(row.userId, row.displayName)}
                    />
                  ))}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    <View style={styles.headerRow}>
                      {matchdays.map((md) => (
                        <View key={md.id} style={[styles.cell, styles.headerCell]}>
                          <ThemedText type="small" themeColor="textSecondary" style={styles.headerCellText}>
                            {shortMatchdayLabel(md)}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                    {rows.map((row) => (
                      <View key={row.userId} style={styles.dataRow}>
                        {matchdays.map((md) => {
                          const cell = row.picks[md.id];
                          return (
                            <GridCell
                              key={md.id}
                              cell={cell}
                              onPress={
                                cell
                                  ? () => setSelected({ cell, playerName: row.displayName, roundLabel: md.roundLabel })
                                  : undefined
                              }
                            />
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          </>
        )}

        <Pressable onPress={() => router.push('/rules')} style={styles.rulesButton}>
          <ThemedText type="linkPrimary">{t.leagueDetail.rules}</ThemedText>
        </Pressable>

        <MatchDetailModal selected={selected} onClose={() => setSelected(null)} />
      </SafeAreaView>
    </ThemedView>
  );
}

function MatchDetailModal({
  selected,
  onClose,
}: {
  selected: { cell: StandingsGridCell; playerName: string; roundLabel: string } | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  if (!selected) return null;
  const { cell, playerName, roundLabel } = selected;
  const { fixture } = cell;
  const isFinished = fixture.status === 'FINISHED' && fixture.homeScore !== null && fixture.awayScore !== null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]} onPress={() => {}}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.modalMeta}>
            {t.standings.modalMeta(playerName, roundLabel)}
          </ThemedText>
          <View style={styles.modalTeams}>
            <ModalTeam team={fixture.homeTeam} isPick={cell.team.id === fixture.homeTeam.id} />
            <View style={styles.modalScoreBlock}>
              {isFinished ? (
                <ThemedText type="title" style={styles.modalScoreText}>
                  {fixture.homeScore} – {fixture.awayScore}
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {fixture.status === 'LIVE' ? t.standings.live : t.standings.notPlayedYet}
                </ThemedText>
              )}
            </View>
            <ModalTeam team={fixture.awayTeam} isPick={cell.team.id === fixture.awayTeam.id} />
          </View>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <ThemedText type="linkPrimary">{t.common.close}</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ModalTeam({ team, isPick }: { team: { name: string; shortName: string; crestUrl: string | null }; isPick: boolean }) {
  const theme = useTheme();
  const { t } = useLocale();
  return (
    <View style={styles.modalTeam}>
      {team.crestUrl && <Image source={{ uri: team.crestUrl }} style={styles.modalCrest} contentFit="contain" />}
      <ThemedText type="small" style={styles.modalTeamName} numberOfLines={2}>
        {team.name}
      </ThemedText>
      {isPick && (
        <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
          {t.standings.picked}
        </ThemedText>
      )}
    </View>
  );
}

function Legend() {
  const theme = useTheme();
  const { t } = useLocale();
  return (
    <View style={styles.legend}>
      <LegendItem color={theme.success} label={t.standings.legendSurvived} />
      <LegendItem color={theme.danger} label={t.standings.legendEliminated} />
      <LegendItem color={theme.textSecondary} label={t.standings.legendPending} />
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function NameCell({
  row,
  canGrantBuyBack,
  isGranting,
  onGrantBuyBack,
}: {
  row: StandingsGridRow;
  canGrantBuyBack: boolean;
  isGranting: boolean;
  onGrantBuyBack: () => void;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  const isAlive = row.status === 'ACTIVE';
  const showGrantButton = canGrantBuyBack && !isAlive && !row.buyBackUsed;
  const tint = isAlive ? theme.success : theme.danger;

  return (
    <View style={[styles.nameCell, styles.dataCellRow, { backgroundColor: tint + '22', borderLeftColor: tint, borderLeftWidth: 4 }]}>
      <ThemedText type="smallBold" numberOfLines={1}>
        {row.displayName}
      </ThemedText>
      <ThemedText type="small" style={{ color: tint, fontWeight: '700' }}>
        {isAlive
          ? t.status.alive
          : row.eliminatedAtMatchdaySequence
            ? t.standings.outMatchday(row.eliminatedAtMatchdaySequence)
            : t.status.eliminated}
      </ThemedText>
      {row.buyBackUsed && (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {t.standings.boughtBackIn}
        </ThemedText>
      )}
      {showGrantButton && (
        <Pressable
          onPress={onGrantBuyBack}
          disabled={isGranting}
          style={[styles.grantButton, { backgroundColor: theme.buyBack }, isGranting && styles.grantButtonDisabled]}>
          {isGranting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedText style={styles.grantButtonText}>{t.standings.grantBuyBack}</ThemedText>
          )}
        </Pressable>
      )}
    </View>
  );
}

function GridCell({ cell, onPress }: { cell: StandingsGridCell | undefined; onPress?: () => void }) {
  const theme = useTheme();

  if (!cell) {
    return (
      <View style={styles.cell}>
        <ThemedText type="small" themeColor="textSecondary">
          —
        </ThemedText>
      </View>
    );
  }

  const isSurvived = cell.outcome === 'WIN' || cell.outcome === 'DRAW';
  const isLoss = cell.outcome === 'LOSS';
  const tint = isSurvived ? theme.success : isLoss ? theme.danger : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.cell, styles.pickCell, { backgroundColor: tint + '22', borderColor: tint }]}>
      {cell.team.crestUrl && (
        <Image source={{ uri: cell.team.crestUrl }} style={styles.crest} contentFit="contain" />
      )}
      <ThemedText type="small" style={[styles.pickCellText, { color: tint }]} numberOfLines={1}>
        {cell.team.shortName}
      </ThemedText>
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
  title: { textAlign: 'center', marginBottom: Spacing.one },
  emptyState: { paddingVertical: Spacing.five, alignItems: 'center' },
  legend: { flexDirection: 'row', gap: Spacing.three, justifyContent: 'center', marginBottom: Spacing.one },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  verticalScroll: { paddingBottom: Spacing.four },
  gridRow: { flexDirection: 'row' },
  headerRow: { flexDirection: 'row' },
  dataRow: { flexDirection: 'row' },
  headerCell: { height: HEADER_ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  headerCellText: { fontWeight: '700' },
  nameCell: {
    width: NAME_COL_WIDTH,
    height: DATA_ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    gap: Spacing.half,
    borderRightWidth: 1,
    borderRightColor: '#8883',
    borderBottomWidth: 1,
    borderBottomColor: '#8883',
  },
  dataCellRow: { height: DATA_ROW_HEIGHT },
  cell: {
    width: CELL_COL_WIDTH,
    height: DATA_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickCell: {
    margin: 3,
    height: DATA_ROW_HEIGHT - 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
  },
  crest: { width: 22, height: 25 },
  pickCellText: { fontSize: 11, fontWeight: '700' },
  grantButton: {
    borderRadius: 6,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    alignSelf: 'flex-start',
  },
  grantButtonDisabled: { opacity: 0.5 },
  grantButtonText: { color: '#fff', fontWeight: '600', fontSize: 11 },
  error: { textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalMeta: { textAlign: 'center' },
  modalTeams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTeam: { flex: 1, alignItems: 'center', gap: Spacing.half },
  modalCrest: { width: 48, height: 54 },
  modalTeamName: { textAlign: 'center' },
  modalScoreBlock: { paddingHorizontal: Spacing.two, alignItems: 'center' },
  modalScoreText: { fontVariant: ['tabular-nums'] },
  modalCloseButton: { alignItems: 'center', paddingTop: Spacing.one },
  rulesButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
