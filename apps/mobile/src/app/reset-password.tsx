import { useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { authApi, ApiError } from '@/api/client';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit() {
    if (!token) return;
    setError(null);
    if (newPassword !== confirmPassword) {
      setError(t.resetPassword.passwordsDontMatch);
      return;
    }
    setIsSubmitting(true);
    try {
      await authApi.resetPassword({ token, newPassword });
      setIsDone(true);
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
          {t.resetPassword.title}
        </ThemedText>

        {!token ? (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {t.resetPassword.missingToken}
            </ThemedText>
            <Link href="/forgot-password" style={styles.link}>
              <ThemedText type="linkPrimary">{t.forgotPassword.title}</ThemedText>
            </Link>
          </>
        ) : isDone ? (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {t.resetPassword.success}
            </ThemedText>
            <Link href="/sign-in" style={styles.link}>
              <ThemedText type="linkPrimary">{t.resetPassword.goToSignIn}</ThemedText>
            </Link>
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {t.resetPassword.subtitle}
            </ThemedText>

            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t.resetPassword.newPasswordPlaceholder}
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoComplete="password-new"
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t.resetPassword.confirmPasswordPlaceholder}
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoComplete="password-new"
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            />

            {error && (
              <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
                {error}
              </ThemedText>
            )}

            <GradientButton
              onPress={handleSubmit}
              disabled={newPassword.length < 8 || confirmPassword.length === 0}
              isLoading={isSubmitting}
              style={styles.button}>
              {t.resetPassword.submit}
            </GradientButton>
          </>
        )}
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
