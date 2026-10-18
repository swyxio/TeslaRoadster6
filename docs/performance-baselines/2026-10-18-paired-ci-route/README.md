# Paired no-video CI observation · 2026-10-18

[Workflow run 39167866091](https://github.com/swyxio/TeslaRoadster6/actions/runs/39167866091)
measured clean builds of 0.0.25 (`15b0a500bad046a95e87abd01e7c07090386d684`)
and 0.0.28 (`5c1a7c61b6d19ca9168c2327fa889326507b9b7c`), in sequence, with
the same seeded two-delivery and flight route and no video. Both routes passed:
the five sampled legs had a maximum separation of 1.842 m. See
[comparison.md](comparison.md) for all observations and per-leg differences.

The 3-logical-CPU hosted Apple M1 virtual runner used an ANGLE paravirtual
Metal renderer. Its one-minute load average was 18.79 before and 5.43 after the
base, and 4.80 before and 13.79 after the candidate. This was a single,
contended pair, not a performance budget or proof of regression. Browser
callback intervals are not GPU completion or display presentation. The room
metric describes one local room, not production capacity.

The reports and compressed trajectories, browser manifests, input events and
synthetic traces are retained here after the CI artifact expires. The source
reports record full revision, fixture hashes, environment, load, metric
definitions, and milestone/route evidence.
