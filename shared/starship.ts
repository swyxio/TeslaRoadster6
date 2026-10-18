/** The common, game-wide mission. The older room donation fund has its own state. */
export const STARSHIP_GOAL = 1_000_000_000;
export const STARSHIP_LAUNCH_DELAY_MS = 30_000;
export const STARSHIP_STAGE_PERCENTAGES = [10,25,50,75,90] as const;

/** Construction stages are visual only and do not create rewards. */
export function starshipStage(total:number):number {
  if(!Number.isFinite(total)||total<0)return 0;
  return STARSHIP_STAGE_PERCENTAGES.filter(percent=>total>=STARSHIP_GOAL*percent/100).length;
}

export type StarshipStatus = {
  total: number;
  personal: number;
  /** Unknown means the existing counter had already reached the goal before tracking began. */
  crossing: 'pending' | 'recorded' | 'unknown';
  /** The un-capped confirmed total at the threshold; lifetime total continues. */
  launchTotal: number | null;
  completedAt: number | null;
  launchAt: number | null;
  launchId: string | null;
  /** A legacy snapshot records observation at cutover, not the historical crossing. */
  cutoverTotal: number | null;
  cutoverAt: number | null;
};

export type StarshipContributor = { name: string; amount: number | null };
/** A driver can appear in both groups; later confirmations can include older earnings. */
export type StarshipContributorGroup = 'at-goal' | 'later';
/** The at-goal index may be building; retry its first page without publishing partial results. */
export type StarshipContributors = { group: StarshipContributorGroup; state: 'pending' | 'building' | 'ready'; contributors: StarshipContributor[]; next: string | null };
