# Structure audit local evidence — 2026-10-18

These captures use the working collision audit layered on immutable landmark candidate `15d23f3`, before release version assignment. The visible `0.0.33` is a provisional local version, not a production release claim.

For each viewport, `scenario.json` is the exact action sequence, `manifest.json` records Chrome/Metal/device and errors, and `trajectory.json` contains received authoritative room poses—not displayed frames. `before.png` and `through-sutro.png` show a real rendered local game. Touch runs use browser emulation; no physical device was tested.

Reproduce with a fresh loopback-only staging Worker and storage directory:

```sh
pnpm build
pnpm exec wrangler dev --config tests/fixtures/wrangler.playtest-stage.jsonc --local --ip 127.0.0.1 --port 8893 --inspector-port 0 --persist-to /tmp/structure-audit-fresh --var PLAYTEST_X:-270 --var PLAYTEST_Z:-18 --var PLAYTEST_YAW:0
pnpm playtest:record --url 'http://127.0.0.1:8893/?room=structure-audit-fresh' --target-ref YOUR_EXACT_REVISION --scenario docs/benchmarks/2026-10-18-structure-audit/desktop/scenario.json --out /tmp/structure-audit-fresh-capture --trajectory --browser chrome --gpu metal
```

Use a new room/output directory for each capture. This fixture stays local, bypasses persistent identity, and must never be deployed. No recording or screenshot is a performance/capacity result.

`surface-audit.json` records 590,058 samples against actual Three.js primitive constructor triangles and the map's spatial index. Reproduce with `pnpm exec tsx scripts/audit-landmark-surfaces.ts`. Whole-model render tests are separate: the constructor audit cannot detect geometry omitted from both descriptions.

`tests.tap` and `build.log` record final protocol48 footprint-extrema validation. The initial three browser captures and earlier protocol47 room/prediction logs precede that final contact calculation; the Sutro constant-height boxes and mesh geometry are unchanged. Final protocol48 integration logs are named separately. `desktop-v48/` repeats the actual Sutro pass after the final body-contact repair and visibly identifies provisional 0.0.34; it is a local candidate capture, not production. This is not production verification.

The two `cost-*.json` files predate the final footprint-extrema repair and are short local pure-simulation observations, **not acceptance benchmarks**. The first predates the box fast path and started near a reserved timing boundary; contention is unresolved. The second has substantial host variance. Both use five drivers/27 total entities, but four drivers slow at contacts, so they are not five-moving-driver room load tests. Final baseline/candidate poses matched. Reproduce the narrow experiment with `pnpm exec tsx scripts/audit-structure-cost.ts BASE_CHECKOUT CANDIDATE_CHECKOUT`; use a reserved quiet interval and do not infer browser, network, Cloudflare or playable-capacity results from it.

`hosted-d1d405b-summary.md` and `hosted-d1d405b-evidence.tar.gz` retain the first GitHub-hosted pair, including raw traces, environment, build and worker logs. The baseline is `8b3d6fe`, so this pair includes the separate landmark dependency as well as this audit. Both room-progress ratios missed the target; callback and synthetic-motion observations are descriptive, not acceptance.
