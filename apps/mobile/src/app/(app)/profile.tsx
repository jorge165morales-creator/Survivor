import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { authApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { confirmAsync } from '@/utils/alerts';
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
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  async function handleDeleteAccount() {
    if (!session) return;
    setDeleteError(null);
    const confirmed = await confirmAsync(
      t.profile.deleteAccountConfirmTitle,
      t.profile.deleteAccountConfirmMessage,
      t.profile.deleteAccountConfirmLabel,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await authApi.deleteAccount({ currentPassword: deletePassword || undefined }, session.accessToken);
      signOut();
      router.replace('/sign-in');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t.profile.couldNotDeleteAccount);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={goBackOrHome} style={styles.backButton}>
          <ThemedText type="linkPrimary">{t.common.back}</ThemedText>
        </Pressable>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

        <ThemedView type="backgroundElement" style={[styles.section, { borderColor: theme.danger }]}>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            {t.profile.deleteAccountTitle}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.profile.deleteAccountWarning}
          </ThemedText>

          <TextInput
            value={deletePassword}
            onChangeText={setDeletePassword}
            placeholder={t.profile.currentPasswordPlaceholder}
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoComplete="password"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />

          {deleteError && (
            <ThemedText type="small" style={[styles.message, { color: theme.danger }]}>
              {deleteError}
            </ThemedText>
          )}

          <Pressable
            onPress={handleDeleteAccount}
            disabled={isDeleting}
            style={[styles.deleteButton, { borderColor: theme.danger }, isDeleting && styles.disabled]}>
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              {t.profile.deleteAccountSubmit}
            </ThemedText>
          </Pressable>
        </ThemedView>
        </ScrollView>
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
  scrollContent: { gap: Spacing.three, paddingBottom: Spacing.five },
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
  deleteButton: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  disabled: { opacity: 0.5 },
});
