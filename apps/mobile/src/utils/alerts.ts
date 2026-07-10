import { Alert, Platform } from 'react-native';

// RN Web's Alert.alert() is a no-op stub (see react-native-web/src/exports/Alert) —
// it never calls back, so confirmation dialogs and error notices silently do
// nothing on web. Route through the browser's native dialogs there instead.

export function confirmAsync(title: string, message: string, confirmLabel = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
