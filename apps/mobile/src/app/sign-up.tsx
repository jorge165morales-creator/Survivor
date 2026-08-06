import { useState } from 'react';
import { Link, router } from 'expo-router';
import { StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { authApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { useLocale } from '@/i18n/locale';
import { useTheme } from '@/hooks/use-theme';

export default function SignUpScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { signIn } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const tokens = await authApi.register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        username: username.trim(),
      });
      signIn(tokens);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.common.somethingWentWrong);
    } finally {
      setIsSubmitting(false);
    }
  }

  const isValidUsername = /^[a-zA-Z0-9_]{3,20}$/.test(username.trim());
  const canSubmit = displayName.trim().length > 0 && isValidUsername && email.length > 0 && password.length >= 8;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Survivor
        </ThemedText>
        <ThemedText type="subtitle" style={styles.subtitle}>
          {t.signUp.createAccount}
        </ThemedText>

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t.signUp.displayNamePlaceholder}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="words"
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        />
        <TextInput
          value={username}
          onChangeText={(value) => setUsername(value.replace(/\s/g, ''))}
          placeholder={t.signUp.usernamePlaceholder}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t.signUp.emailPlaceholder}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t.signUp.passwordPlaceholder}
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

        <GradientButton onPress={handleSubmit} disabled={!canSubmit} isLoading={isSubmitting} style={styles.button}>
          {t.signUp.submit}
        </GradientButton>

        <Link href="/sign-in" style={styles.link}>
          <ThemedText type="linkPrimary">{t.signUp.haveAccount}</ThemedText>
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
  subtitle: { textAlign: 'center', marginBottom: Spacing.three },
  input: {
    borderWidth: 1.5,
    borderColor: '#8888',
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
