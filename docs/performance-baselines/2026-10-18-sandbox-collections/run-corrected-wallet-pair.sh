#!/bin/sh
set -u
wallet_dir=/private/tmp/tesland-evidence-staging
wallet_pid=
cleanup() {
  if [ -n "$wallet_pid" ]; then kill "$wallet_pid" 2>/dev/null || true; wait "$wallet_pid" 2>/dev/null || true; wallet_pid=; fi
}
trap cleanup EXIT HUP INT TERM
run_side() {
  wallet_side="$1"
  if [ "$wallet_side" = base ]; then
    wallet_root=/private/tmp/tesland-release-pair-load-base
    wallet_extra=
    wallet_protocol=44
  else
    wallet_root=/private/tmp/tesland-playtest-sandbox
    wallet_extra=--expect-collection
    wallet_protocol=46
  fi
  wallet_state=$(mktemp -d /private/tmp/tesland-corrected-wallet-"$wallet_side".XXXXXX)
  wallet_output="$wallet_dir/corrected-throughput-$wallet_side.json"
  if [ -e "$wallet_output" ]; then printf 'Refusing to overwrite %s\n' "$wallet_output"; return 1; fi
  cd "$wallet_root" || return 1
  ./node_modules/.bin/wrangler dev --config tests/fixtures/luxury-wallet-wrangler.jsonc --local --ip 127.0.0.1 --port 18797 --persist-to "$wallet_state" > "$wallet_dir/corrected-worker-$wallet_side.log" 2>&1 &
  wallet_pid=$!
  wallet_ready=0
  for i in $(seq 1 90); do
    if curl --max-time 1 -fsS http://127.0.0.1:18797/api/health > "$wallet_dir/corrected-health-$wallet_side.json" 2>/dev/null; then
      if node -e "const h=require(process.argv[1]);process.exit(h.version===Number(process.argv[2])?0:1)" "$wallet_dir/corrected-health-$wallet_side.json" "$wallet_protocol"; then wallet_ready=1; break; fi
      printf "Wrong health protocol on fresh port for %s\n" "$wallet_side"; cleanup; return 1
    fi
    if ! kill -0 "$wallet_pid" 2>/dev/null; then break; fi
    sleep 0.25
  done
  if [ "$wallet_ready" -ne 1 ]; then printf 'Worker did not start: %s\n' "$wallet_side"; cleanup; return 1; fi
  printf 'START %s %s\n' "$wallet_side" "$(date -u +%FT%TZ)"
  if [ -n "$wallet_extra" ]; then
    ./node_modules/.bin/tsx tests/luxury-wallet-throughput.bench.ts http://127.0.0.1:18797 "$wallet_output" --drive "$wallet_extra" > "$wallet_dir/corrected-run-$wallet_side.log" 2>&1
  else
    ./node_modules/.bin/tsx tests/luxury-wallet-throughput.bench.ts http://127.0.0.1:18797 "$wallet_output" --drive > "$wallet_dir/corrected-run-$wallet_side.log" 2>&1
  fi
  wallet_status=$?
  printf 'END %s status=%s %s\n' "$wallet_side" "$wallet_status" "$(date -u +%FT%TZ)"
  cleanup
  if [ ! -s "$wallet_output" ]; then printf 'Missing output: %s\n' "$wallet_side"; return 1; fi
  return 0
}
run_side base || exit 1
run_side candidate || exit 1
printf 'PAIR COMPLETE\n'
