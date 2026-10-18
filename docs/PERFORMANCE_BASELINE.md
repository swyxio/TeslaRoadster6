# Local performance baseline

Run this on an otherwise idle machine, after `pnpm install --frozen-lockfile`:

```sh
node scripts/performance-baseline.mjs --samples 3 > /tmp/tesland-perf.json
# or: pnpm --silent perf:baseline --samples 3 > /tmp/tesland-perf.json
```

The command runs `pnpm test` and `pnpm build` sequentially, reversing their order on alternate samples. It records every wall time, the 1-, 5-, and 15-minute system load averages before and after each command, commit and dirty status, lockfile hash, runtime, and host details. It preserves the usual `dist` output from the final `pnpm build`; do not run it while another process relies on that directory. A failure stops the run and displays the tail of the failing command's output. The default is three samples; increase the count to study variability. These are repeated warm local runs, not controlled clean-room benchmarks. OS caches, process scheduling, thermal state, and concurrent work still matter; load averages are context, not an isolation guarantee.

A separate Vite build in a temporary directory emits a manifest. The report walks `index.html`'s static JavaScript import graph once, checks its scripts and script preloads against the built HTML, and verifies that each measured file is byte-identical to the sampled build. It records the entry HTML SHA-256 and lists a SHA-256 and raw bytes for each asset, and the sum of **individually** gzip- and Brotli-compressed bytes for those files. Compression uses Node's default settings. Dynamic import roots are listed but excluded; dynamically requested startup code, inline scripts, CSS, HTML, fonts, images, cache behavior, headers, and network overhead are outside this total. The command fails if HTML contains a missing module entry script, unaccounted script or preload, or inline script. Compression estimates are not transferred-byte measurements: server settings, browser support and cache hits affect actual requests.

To sample actual encoded response bodies for that same graph, serve the measured build and run:

```sh
node scripts/performance-transfer.mjs http://localhost:8787 /tmp/tesland-perf.json 3 > /tmp/tesland-transfer.json
```

Use the deployed origin instead of localhost to measure a deployment of the same build. Each request sends `Accept-Encoding: br, gzip` and has no browser cache; an edge cache may still be warm. The probe requires the served HTML to reference the measured entry and checks every decoded asset against its build hash. It reports actual encoded body bytes, response encoding and cache headers; HTTP headers and transport overhead are excluded. It flags HTML differences and makes a best-effort scan for additional script or script-preload URLs, but those extra requests, inline code and runtime dynamic imports are **not** counted in the graph total. In particular, a hosting provider can inject analytics into the HTML. The probe does not execute JavaScript or simulate browser cache policy; use a browser trace for complete request discovery.

For the complete observed startup, open Chrome DevTools → Network, enable **Disable cache**, reload the game while DevTools stays open, and filter for JavaScript. Sum the transferred sizes for requests made before interaction, including third-party and startup dynamic imports. Inspect each response's `Content-Encoding`, record whether the server was localhost or deployed, and retain the network log or HAR for review. DevTools transfer sizes include headers and reflect that browser, server and session; they are not directly comparable to the probe's encoded body bytes.

Keep JSON from multiple runs, along with notes about load and environment. Compare matching Node/pnpm versions, lockfile, hardware, workloads, source changes, and run conditions; use a clean checkout or record the dirty diff. Alternate builds when evaluating a change, inspect every sample and investigate variation before drawing conclusions. No automated threshold is set until repeat measurements on a suitably stable runner support one. These measurements do not assess frame time, GPU work, touch controls, server capacity or production latency; see [the performance audit](PERFORMANCE_AUDIT.md) for those distinctions and further profiling.
