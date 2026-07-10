import { useCallback, useEffect, useReducer } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Cross-platform key-value persistence for the auth session: SecureStore on
// native, localStorage on web (SecureStore has no web implementation).
// Pattern follows Expo Router's documented auth-storage approach.

type UseStateHook<T> = [[boolean, T | null], (value: T | null) => void];

function useAsyncState<T>(initialValue: [boolean, T | null] = [true, null]): UseStateHook<T> {
  return useReducer(
    (_state: [boolean, T | null], action: T | null = null): [boolean, T | null] => [false, action],
    initialValue,
  ) as UseStateHook<T>;
}

async function setStorageItemAsync(key: string, value: string | null) {
  if (Platform.OS === "web") {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } else if (value === null) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export function useStorageState<T>(key: string): UseStateHook<T> {
  const [state, setState] = useAsyncState<T>();

  useEffect(() => {
    if (Platform.OS === "web") {
      try {
        const raw = localStorage.getItem(key);
        setState(raw ? (JSON.parse(raw) as T) : null);
      } catch {
        setState(null);
      }
    } else {
      SecureStore.getItemAsync(key).then((raw) => {
        try {
          setState(raw ? (JSON.parse(raw) as T) : null);
        } catch {
          setState(null);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback(
    (value: T | null) => {
      setState(value);
      setStorageItemAsync(key, value === null ? null : JSON.stringify(value));
    },
    [key],
  );

  return [state, setValue];
}
