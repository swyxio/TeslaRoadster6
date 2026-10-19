# Hosted 64-driver investigation evidence

On 2026-10-18 Pacific, the five linked GitHub Actions runs' artifacts were
downloaded before their 2026-11-02 expiry. Each archive contains its four group
reports and before/after identity files, assembly results, and preview identity
artifacts. The original runs and their interpretation are in
[the investigation](../../PERFORMANCE_64_PLAYERS.md).

The archives preserve the reports as retrieved except that preview URLs in
`preview` and `origin` fields are replaced with `[redacted preview URL]`.
Changed JSON is reformatted and changed gzip files are recompressed. Each
archive's `MANIFEST.json` records the SHA-256 of every downloaded and retained
file and the number of redacted URLs. The four `identity-after.json` files in
run 39185379789 were empty when downloaded; post-run identity is missing for
that run. These are historical measurements, not evidence that 64-player
gameplay or the continuity gate passes.

| Run archive | SHA-256 |
| --- | --- |
| [39185379789](39185379789.tar.gz) | `b04e5d0bbf201f6e21dff389d68b2dbd51e5e45dff18d932c64cd7628fb74481` |
| [39186107476](39186107476.tar.gz) | `09cb543025e54f70a5b0376490c94dd2d2371a03cae7f244dc55201369daffa7` |
| [39186168542](39186168542.tar.gz) | `429340eba82a91572299045330478057bdac57d3ba7847d45c02c51a83382749` |
| [39187526596](39187526596.tar.gz) | `3a0a95ec36ad716fb0b37dcc523dc191afcb7c616c7ece871af48b35b735261d` |
| [39187590890](39187590890.tar.gz) | `ddd62f62ae09430956a43f848e9634c735e4ca0f03430e62157de21d13db3870` |
