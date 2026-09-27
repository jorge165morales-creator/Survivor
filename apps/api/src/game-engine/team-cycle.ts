/**
 * A season with more matchdays than teams (e.g. a 38-matchday, 20-team
 * round-robin league like La Liga or the Premier League) can't sustain
 * "never reuse a team" for the whole season — a player would run out of
 * distinct teams around matchday 20 and be forced out by roster exhaustion
 * rather than an actual loss. Instead, the used-teams list resets every
 * `teamCount` matchdays: matchdays 1..teamCount are cycle 0,
 * teamCount+1..2*teamCount are cycle 1, and so on — a team used in an
 * earlier cycle becomes available again once a new cycle starts.
 *
 * Deliberately a function of the matchday's own sequence number and the
 * season's team count alone — not of pick submission order or how many
 * teams a player happens to have used so far — so pre-picking a future
 * matchday ahead of earlier ones (explicitly supported, see the Rules
 * screen's "populate future matches" tip) can never misalign the cycle
 * boundaries relative to picking in strict chronological order.
 *
 * A group-and-knockout competition (e.g. the Champions League: 17
 * matchdays, 36+ teams) never plays enough matchdays to reach teamCount, so
 * this always returns 0 there — cycle 0 covers the entire season, meaning
 * the reset never actually triggers.
 */
export function cycleIndexForSequence(sequence: number, teamCount: number): number {
  if (teamCount <= 0) return 0;
  return Math.floor((sequence - 1) / teamCount);
}
