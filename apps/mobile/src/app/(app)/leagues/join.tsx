import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { goBackOrHome } from '@/utils/navigation';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

export default function JoinLeagueScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { session } = useSession();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!session) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const league = await leaguesApi.join({ inviteCode: inviteCode.trim() }, session.accessToken);
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
          {t.joinLeague.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {t.joinLeague.subtitle}
        </ThemedText>

        <TextInput
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder={t.joinLeague.inviteCodePlaceholder}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        />

        {error && (
          <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
            {error}
          </ThemedText>
        )}

        <GradientButton
          onPress={handleSubmit}
          disabled={inviteCode.trim().length === 0}
          isLoading={isSubmitting}
          style={styles.button}>
          {t.joinLeague.submit}
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
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
  },
  button: { marginTop: Spacing.two },
  cancel: { alignSelf: 'center', marginTop: Spacing.two },
  error: { textAlign: 'center' },
});
