import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AuthUser } from '@survivor/shared-types';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { usersApi, ApiError } from '@/api/client';
import { useSession } from '@/state/session';

export default function HomeScreen() {
  const { session, signOut } = useSession();
  const [profile, setProfile] = useState<AuthUser | null>(session?.user ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    usersApi
      .me(session.accessToken)
      .then(setProfile)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your profile.');
      });
  }, [session]);

  const handleSignOut = useCallback(() => {
    signOut();
    router.replace('/sign-in');
  }, [signOut]);

  if (!session) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          {profile ? (
            <>
              <ThemedText type="title" style={styles.title}>
                Welcome, {profile.displayName}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {profile.email}
              </ThemedText>
            </>
          ) : (
            <ActivityIndicator />
          )}
          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Leagues, picks, and standings land here in the next phase.
        </ThemedText>

        <Pressable onPress={handleSignOut} style={styles.signOutButton}>
          <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
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
    gap: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  title: { textAlign: 'center' },
  hint: { textAlign: 'center' },
  error: { color: '#e5484d', textAlign: 'center' },
  signOutButton: {
    borderWidth: 1,
    borderColor: '#8888',
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  signOutText: { fontWeight: '600' },
});
