#!/bin/sh
set -u
run_motion() {
  motion_side="$1"
  motion_profile="$2"
  if [ "$motion_side" = base ]; then motion_root=/private/tmp/tesland-release-pair-base; else motion_root=/private/tmp/tesland-playtest-sandbox; fi
  motion_out="/private/tmp/tesland-evidence-staging/motion-${motion_side}-${motion_profile}"
  if node /private/tmp/tesland-motion-gate/run.mjs --run "$motion_root" --out "$motion_out" --profile "$motion_profile" --gpu metal > "$motion_out.log" 2>&1; then
    printf 'COMPLETE %s %s\n' "$motion_side" "$motion_profile"
  else
    printf 'FAILED %s %s; see %s.log\n' "$motion_side" "$motion_profile" "$motion_out"
    return 1
  fi
}
run_motion candidate zero || exit 1
for motion_case in steady150 bunched150 gap250; do
  run_motion base "$motion_case" || exit 1
  run_motion candidate "$motion_case" || exit 1
done
