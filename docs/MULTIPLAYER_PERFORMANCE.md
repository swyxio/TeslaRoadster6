# Multiplayer driving and capacity research

Research and implementation notes, 2026-10-18 Pacific. The goal is responsive driving in a shared Bay, with the server authoritative for collisions, activities and rewards. Socket counts, simulated benchmarks and real-player capacity are different measurements.

## What established games and research suggest

- Blizzard's [WoW engineering account](https://worldofwarcraft.blizzard.com/en-us/news/23504702) describes using automated players and server frame-time profiling to find crowded-world bottlenecks. Its discussion of sharding also highlights a gameplay tradeoff: people or NPCs may disappear when crossing a shard boundary. This game already has separate rooms; it should not split a friend's visible session merely to inflate a player count.
- [Client prediction and reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html) can make the driver's own input visible immediately while a server remains authoritative: tag inputs, acknowledge what the server has processed, and replay still-pending inputs from the confirmed state. Correcting position without tracking processed inputs can double-apply movement. Predictions must yield to server outcomes and handle reconnects, collisions, vehicle changes, ferries and teleports.
- [Interpolation](https://www.gabrielgambetta.com/entity-interpolation.html) can smooth remote entities from received states, at the cost of displaying them slightly in the past. A [University of Waterloo and Ubisoft vehicle-replication study](https://ece.uwaterloo.ca/~sl2smith/papers/2023TOG-Predictive_Dead_Reckoning.pdf) notes that high speed, turns and collisions amplify extrapolation errors. Its experiments used a Unity simulation; they do not establish Rockstar's proprietary implementation. This project does not need the paper's neural-network approach without evidence that a simpler method fails.
- [Cloudflare's WebSocket documentation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) describes the platform's connection support and idle hibernation. Neither is a gameplay-capacity result. This game's physics timer stays active in occupied rooms, so test simulation time, snapshot work and bytes in addition to connections.

## Implemented approach

The combined build predicts only the local controlled car for a bounded number of input ticks and reconciles with server acknowledgements. Prediction pauses around nearby moving bodies, special surfaces, stale snapshots and gameplay actions. Other cars are smoothed with brief presentation-only extrapolation. Game outcomes remain authoritative. The snapshot serializer reuses common serialized data, but no capacity gain has been established from that change.

## Baseline and measurement

On the v21 baseline, the server steps at 20 Hz, sends complete recipient-filtered snapshots at 10 Hz and consumes the latest input. The client sends input at 20 Hz and renders the last authoritative state with smoothing; it does not yet acknowledge or replay individual inputs. These rates do not by themselves measure user-perceived latency.

Use bounded, reproducible tests with realistic moving players and separately record server tick progress, per-client snapshot gaps, bytes and input-to-visible response under added latency and jitter. Measure local responsiveness separately from authoritative agreement. Exercise corrections at collisions, island ramps, the ferry, races, vehicle changes and disconnect/reconnect. A busy development host, a same-process microbenchmark or a same-machine WebSocket smoke is not a production, WAN, mobile-rendering or sustained-capacity measurement.
