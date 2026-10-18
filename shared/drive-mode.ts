/** Player-selected behavior for a destination route. Flight is fictional arcade driving. */
export type DriveMode = 'road' | 'jump' | 'sky';

export function isDriveMode(value:unknown):value is DriveMode {
  return value==='road'||value==='jump'||value==='sky';
}
