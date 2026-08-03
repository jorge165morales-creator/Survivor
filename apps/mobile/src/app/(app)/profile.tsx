import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { authApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { goBackOrHome } from '@/utils/navigation';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { session, signOut } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) {
    return null;
  }

  function handleSignOut() {
    signOut();
    router.replace('/sign-in');
  }

  async function handleSubmit() {
    if (!session) return;
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError(t.profile.passwordsDontMatch);
      return;
    }
    setIsSubmitting(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword }, session.accessToken);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.profile.couldNotChange);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={goBackOrHome} style={styles.backButton}>
          <ThemedText type="linkPrimary">{t.common.back}</ThemedText>
        </Pressable>

        <ThemedText type="title" style={styles.title}>
          {t.profile.title}
        </ThemedText>

        <ThemedView type="backgroundElement" style={[styles.section, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t.profile.emailLabel}
          </ThemedText>
          <ThemedText type="smallBold">{session.user.email}</ThemedText>
          <Pressable onPress={handleSignOut} style={styles.signOut}>
            <ThemedText type="linkPrimary">{t.home.signOut}</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView type="backgroundElement" style={[styles.section, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">{t.profile.changePasswordTitle}</ThemedText>

          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder={t.profile.currentPasswordPlaceholder}
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoComplete="password"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={t.profile.newPasswordPlaceholder}
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoComplete="password-new"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t.profile.confirmPasswordPlaceholder}
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoComplete="password-new"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />

          {error && (
            <ThemedText type="small" style={[styles.message, { color: theme.danger }]}>
              {error}
            </ThemedText>
          )}
          {success && (
            <ThemedText type="small" style={[styles.message, { color: theme.success }]}>
              {t.profile.success}
            </ThemedText>
          )}

          <GradientButton
            onPress={handleSubmit}
            disabled={currentPassword.length === 0 || newPassword.length < 8 || confirmPassword.length === 0}
            isLoading={isSubmitting}
            style={styles.button}>
            {t.profile.submit}
          </GradientButton>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
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
  },
  backButton: { paddingTop: Spacing.three },
  title: { textAlign: 'center' },
  section: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  signOut: { marginTop: Spacing.one },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
  },
  button: { marginTop: Spacing.one },
  message: { textAlign: 'center' },
});
