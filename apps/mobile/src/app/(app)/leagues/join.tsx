import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { leaguesApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';
import { goBackOrHome } from '@/utils/navigation';

export default function JoinLeagueScreen() {
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
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Join a League
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Enter the invite code a friend shared with you.
        </ThemedText>

        <TextInput
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="Invite code"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting || inviteCode.trim().length === 0}
          style={[styles.button, (isSubmitting || inviteCode.trim().length === 0) && styles.buttonDisabled]}>
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>Join</ThemedText>}
        </Pressable>

        <Pressable onPress={goBackOrHome} style={styles.cancel}>
          <ThemedText type="linkPrimary">Cancel</ThemedText>
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
    borderWidth: 1,
    borderColor: '#8888',
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  cancel: { alignSelf: 'center', marginTop: Spacing.two },
  error: { color: '#e5484d', textAlign: 'center' },
});
