import { router } from 'expo-router';
import type { CompetitionSummary } from '@survivor/shared-types';

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

// Deep-links into the Rules tab pre-selected to one competition — see
// (tabs)/rules.tsx, which reads these same param names back out. Used from
// inside a league (leagues/[id]/index.tsx, standings.tsx) where the
// league's own competition is already known, so Rules doesn't have to wait
// on its own leaguesApi.mine() call to show the right copy.
export function pushRulesFor(competition: CompetitionSummary) {
  router.push({
    pathname: '/rules',
    params: {
      competitionSlug: competition.slug,
      competitionName: competition.name,
      structure: competition.structure,
      matchdayCount: String(competition.matchdayCount),
    },
  });
}
