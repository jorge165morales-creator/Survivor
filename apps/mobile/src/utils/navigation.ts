import { router } from 'expo-router';

// Screens pushed directly via a deep link (or Playwright's page.goto in tests)
// have no history entry to pop, and router.back() then fails silently with a
// dev-only "GO_BACK not handled" warning, stranding the user on the screen.
// Fall back to the league list when there's nothing to go back to.
export function goBackOrHome() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}
