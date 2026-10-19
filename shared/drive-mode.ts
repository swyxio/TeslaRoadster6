/** Player-selected behavior for a destination route. Flight is fictional arcade driving. */
export type DriveMode = 'road' | 'intercity' | 'jump' | 'sky';

export function isDriveMode(value:unknown):value is DriveMode {
  return value==='road'||value==='intercity'||value==='jump'||value==='sky';
}
