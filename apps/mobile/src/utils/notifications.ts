import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_LEAD_MS = 60 * 60 * 1000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let hasRequestedPermission = false;

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (hasRequestedPermission) return false;
  hasRequestedPermission = true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * The device's Expo push token, for registering with the API so
 * pick-reminder-scheduler.service.ts (server-side) can actually reach this
 * device — separate from the on-device syncPickReminder below, which needs
 * no server round-trip at all. Returns null on web (push isn't supported
 * there the same way) or if permission was denied; never throws, since a
 * failed registration shouldn't block anything else in the app.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const granted = await ensurePermission();
    if (!granted) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

function reminderId(leagueId: string, matchdayId: string): string {
  return `pick-reminder-${leagueId}-${matchdayId}`;
}

/**
 * Schedules a local "make your pick" reminder for 3 hours before a matchday
 * locks. Safe to call every time pick data loads: cancels any previously
 * scheduled reminder for this matchday first, so a changed lockAt (fixture
 * correction) or an already-submitted pick doesn't leave a stale notification
 * behind — pass shouldRemind: false to just clear it.
 */
export async function syncPickReminder(params: {
  leagueId: string;
  matchdayId: string;
  title: string;
  body: string;
  lockAt: string;
  shouldRemind: boolean;
}): Promise<void> {
  const id = reminderId(params.leagueId, params.matchdayId);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

  if (!params.shouldRemind) return;

  const fireAt = new Date(params.lockAt).getTime() - REMINDER_LEAD_MS;
  if (fireAt <= Date.now()) return;

  const granted = await ensurePermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: params.title,
      body: params.body,
    },
    trigger:
      Platform.OS === 'web'
        ? null
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  });
}
