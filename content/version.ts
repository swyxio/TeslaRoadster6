/** Kept separate so the game does not download the full changelog at startup. */
const version='0.0.40-alpha';
export const CURRENT_RELEASE={version,label:releaseLabel(version)};

export function releaseLabel(value:string):string {
  return /^\d+\.\d+\.\d+-alpha$/.test(value)?value.replace(/-alpha$/,' Alpha'):value;
}
