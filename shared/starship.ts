/** The common, game-wide mission. The older room donation fund has its own state. */
export const STARSHIP_GOAL = 1_000_000_000;
export const STARSHIP_LAUNCH_DELAY_MS = 30_000;

export type StarshipStatus = {
  total: number;
  personal: number;
  completedAt: number | null;
  launchAt: number | null;
  launchId: string | null;
};

export type StarshipContributor = { name: string; amount: number };
export type StarshipContributors = { contributors: StarshipContributor[]; next: string | null };
