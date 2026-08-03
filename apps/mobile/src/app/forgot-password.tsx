import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { authApi, ApiError } from '@/api/client';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      // The API always responds the same way whether or not the email is
      // registered, so there's nothing account-specific to branch on here —
      // showing the confirmation is the only correct behavior either way.
      await authApi.forgotPassword({ email: email.trim() });
      setIsSent(true);
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
          {t.forgotPassword.title}
        </ThemedText>

        {isSent ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            {t.forgotPassword.confirmation}
          </ThemedText>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {t.forgotPassword.subtitle}
            </ThemedText>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t.forgotPassword.emailPlaceholder}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            />

            {error && (
              <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
                {error}
              </ThemedText>
            )}

            <GradientButton
              onPress={handleSubmit}
              disabled={email.trim().length === 0}
              isLoading={isSubmitting}
              style={styles.button}>
              {t.forgotPassword.submit}
            </GradientButton>
          </>
        )}

        <Link href="/sign-in" style={styles.link}>
          <ThemedText type="linkPrimary">{t.forgotPassword.backToSignIn}</ThemedText>
        </Link>
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
  subtitle: { textAlign: 'center' },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
  },
  button: { marginTop: Spacing.two },
  link: { alignSelf: 'center', marginTop: Spacing.three },
  error: { textAlign: 'center' },
});
