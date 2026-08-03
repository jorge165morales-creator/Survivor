import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LeagueSummary } from '@survivor/shared-types';

import { GradientButton } from '@/components/gradient-button';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { leaguesApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

export default function LeagueListScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { session } = useSession();
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    setError(null);
    leaguesApi
      .mine(session.accessToken)
      .then(setLeagues)
      .catch((err) => setError(err instanceof ApiError ? err.message : t.home.couldNotLoadLeagues))
      .finally(() => setIsRefreshing(false));
  }, [session, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function handleRefresh() {
    setIsRefreshing(true);
    load();
  }

  if (!session) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <View style={styles.headerText}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
              {t.home.welcomeBack}
            </ThemedText>
            <ThemedText type="subtitle">{session.user.displayName}</ThemedText>
          </View>
          <View style={styles.headerActions}>
            <LanguageToggle />
            <Pressable onPress={() => router.push('/profile')}>
              <ThemedText type="linkPrimary">{t.home.profile}</ThemedText>
            </Pressable>
          </View>
        </ThemedView>

        <ThemedView style={styles.actionsRow}>
          <GradientButton style={styles.createButton} onPress={() => router.push('/leagues/create')}>
            {t.home.createLeague}
          </GradientButton>
          <Pressable
            style={[styles.actionButtonSecondary, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            onPress={() => router.push('/leagues/join')}>
            <ThemedText style={styles.actionButtonSecondaryText}>{t.home.joinLeague}</ThemedText>
          </Pressable>
        </ThemedView>

        {error && (
          <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
            {error}
          </ThemedText>
        )}

        {leagues === null ? (
          <ActivityIndicator style={styles.loading} />
        ) : leagues.length === 0 ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText type="small" themeColor="textSecondary">
              {t.home.emptyState}
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
  const theme = useTheme();
  const { t } = useLocale();
  const isAlive = league.myStatus === 'ACTIVE';
  const statusColor = isAlive ? theme.success : theme.danger;
  return (
    <Pressable onPress={() => router.push(`/leagues/${league.id}`)} style={({ pressed }) => pressed && styles.cardPressed}>
      <ThemedView
        type="backgroundElement"
        style={[styles.card, { borderColor: theme.border, borderLeftColor: statusColor }]}>
        <View style={styles.cardTop}>
          <ThemedText type="smallBold" style={styles.cardName}>
            {league.name}
          </ThemedText>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <ThemedText type="small" style={[styles.statusPillText, { color: statusColor }]}>
              {isAlive ? t.status.alive : league.myStatus === 'ELIMINATED' ? t.status.eliminated : ''}
            </ThemedText>
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t.home.seasonAndMembers(league.season.name, league.memberCount, league.maxMembers)}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
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
  headerText: { gap: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  eyebrow: { letterSpacing: 1.5, fontFamily: 'Outfit_700Bold', fontSize: 12 },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  createButton: { flex: 1 },
  actionButtonSecondary: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonSecondaryText: { fontFamily: 'Outfit_700Bold', fontSize: 16 },
  loading: { marginTop: Spacing.five },
  emptyState: { paddingVertical: Spacing.five, alignItems: 'center' },
  list: { gap: Spacing.three, paddingBottom: Spacing.four },
  cardPressed: { opacity: 0.85 },
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderLeftWidth: 4,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  cardName: { flex: 1, fontSize: 17 },
  statusPill: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  statusPillText: { fontFamily: 'Outfit_700Bold', fontSize: 12 },
  error: { textAlign: 'center' },
});
