import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Switch, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SeasonSummary } from '@survivor/shared-types';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi, seasonsApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { goBackOrHome } from '@/utils/navigation';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

export default function CreateLeagueScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { session } = useSession();
  const [seasons, setSeasons] = useState<SeasonSummary[] | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [buyBackEnabled, setBuyBackEnabled] = useState(false);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    seasonsApi
      .all(session.accessToken)
      .then((all) => {
        // Excludes the historical test-data season (prisma/seed.ts's
        // seedHistoricalTestSeason) — that's internal-only, used for the
        // friends-only practice league and exercising the game engine
        // end-to-end, never a real option for a league a user creates here.
        const real = all.filter((s) => s.isActive);
        setSeasons(real);
        setSeasonId(real[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t.createLeague.couldNotLoadSeasons));
  }, [session, t]);

  async function handleSubmit() {
    if (!session || !seasonId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const league = await leaguesApi.create(
        { name: name.trim(), seasonId, buyBackEnabled, paymentRequired },
        session.accessToken,
      );
      router.replace(`/leagues/${league.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.common.somethingWentWrong);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          {t.createLeague.title}
        </ThemedText>

        {seasons ? (
          <ThemedView style={styles.seasonList}>
            {seasons.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setSeasonId(s.id)}
                style={[
                  styles.seasonChip,
                  { borderColor: theme.border },
                  seasonId === s.id && [
                    styles.seasonChipSelected,
                    { borderColor: theme.primary, backgroundColor: theme.primary + '18' },
                  ],
                ]}>
                <ThemedText type="small" themeColor={seasonId === s.id ? 'text' : 'textSecondary'}>
                  {s.name}
                </ThemedText>
              </Pressable>
            ))}
          </ThemedView>
        ) : (
          <ActivityIndicator />
        )}

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t.createLeague.namePlaceholder}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        />

        <ThemedView type="backgroundElement" style={[styles.buyBackRow, { borderColor: theme.border }]}>
          <ThemedView style={styles.buyBackText}>
            <ThemedText type="smallBold">{t.createLeague.buyBackTitle}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t.createLeague.buyBackDescription}
            </ThemedText>
          </ThemedView>
          <Switch
            value={buyBackEnabled}
            onValueChange={setBuyBackEnabled}
            trackColor={{ true: theme.buyBack }}
          />
        </ThemedView>

        <ThemedView type="backgroundElement" style={[styles.buyBackRow, { borderColor: theme.border }]}>
          <ThemedView style={styles.buyBackText}>
            <ThemedText type="smallBold">{t.createLeague.paymentTitle}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t.createLeague.paymentDescription}
            </ThemedText>
          </ThemedView>
          <Switch
            value={paymentRequired}
            onValueChange={setPaymentRequired}
            trackColor={{ true: theme.primary }}
          />
        </ThemedView>

        {error && (
          <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
            {error}
          </ThemedText>
        )}

        <GradientButton
          onPress={handleSubmit}
          disabled={!seasonId || name.trim().length === 0}
          isLoading={isSubmitting}
          style={styles.button}>
          {t.createLeague.submit}
        </GradientButton>

        <Pressable onPress={goBackOrHome} style={styles.cancel}>
          <ThemedText type="linkPrimary">{t.common.cancel}</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginBottom: Spacing.two },
  seasonList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  seasonChip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  seasonChipSelected: { borderWidth: 2 },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
  },
  buyBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  buyBackText: { flex: 1, gap: Spacing.half },
  button: { marginTop: Spacing.two },
  cancel: { alignSelf: 'center', marginTop: Spacing.two },
  error: { textAlign: 'center' },
});
