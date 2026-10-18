# Rocket Island and parking playgrounds · implementation status

This checkout implements the first Rocket Island playground in the shared simulation and renderer. It is a fictional, compressed game location; it does not represent real vehicle capabilities. The public deployment may still run an earlier revision. See [VERIFICATION.md](VERIFICATION.md) for observed checks and [CONTRACTS.md](CONTRACTS.md) for protocol and implementation details.

## In the current checkout

- **Island and ferry:** The island has a water gap, an SF dock and a server-owned autonomous ferry. Its 38 × 14 m deck supports up to six cars, plus people. Board while docked; cars must be fully on the deck and stopped for departure. Riders remain attached and cannot drive or exit while crossing. After arrival, riders can leave; remaining passengers move to checked shore positions after a timeout, or the ferry waits if the apron is blocked. HUD and minimap show ferry state; the simulation uses a 30-second boarding window and ordinary simulation time.
- **Safety and delivery:** The island polygon and ferry support clear pursuits and prevent police detection. The current order timer pauses there; active-play time retains its usual rules. Recovery and vehicle selection use checked local island positions where available.
- **Rocket pads:** Purple pickups on the island and at the registered parking playgrounds refill a driven vehicle's tank and grant 90 seconds of fictional Rocket capability. Pads return after 20 seconds; another pickup refreshes rather than stacks the duration. Contention is settled by vehicle ID. The stock Rocket Roadster keeps its permanent capability. Effects and expiry belong to the vehicle, not its driver.
- **Bank and cliff:** A banked lane with tapered entry, exit and shoulders and a separate 24 m-wide inverted cliff use the same vertices for rendering and physical support. The cliff sweeps about 225° around a 20 m radius. Rocket fans can adhere beyond vertical; ordinary cars fall or bounce. The short circuit and speed oval are separate flat roads; the bank is not a banked oval.
- **Racing:** The short circuit and speed oval have optional, server-owned lobbies for up to eight drivers, a 15-second lobby, three-second countdown and directional 3D checkpoints. Joining assigns a checked start position; a host can start early. Cars remain physical and can bump. Results and timers are session-only.
- **Parking:** The shared registry currently contains two playgrounds, one in SF and one on the island. Both offer Park It and Cut the queue through the Actions drawer. Park It requires a complete car footprint, heading and speed to satisfy a stall for two seconds. Queue play records arrival order and awards eligible stalls. These games are opt-in and do not create persistent rewards.

The world clock accelerates the sky and traffic demand, not ferry travel, upgrades, physics or activity timers. A paused solo game and an empty/restarted room do not accumulate simulation time.

## Remaining work and evidence

- The ferry does not yet have separate marked pedestrian bays, physical gate animation, dock countdown signs, or ferry-specific audio. Its six-car rule is a gameplay constraint, not a measured throughput guarantee; blocked/full-deck and all-vehicle boarding behavior need further end-to-end playtesting.
- The two registered parking playgrounds share the same controller. Decorative or incidental parking spaces elsewhere have not been audited or converted, and queue play has no scripted NPC queue. Add future playable lots to the same shared registry.
- The bank, cliff, race courses, ferry crossing and parking games need full desktop and touch playthroughs, including joining, leaving, congestion and recovery. End-to-end two-client ferry crossings and actual physical-device touch remain unverified unless a later dated entry records them.
- Verify late-joining and disconnecting passengers, blocked destinations, all 26 vehicle footprints and temporary-upgrade expiry during a crossing or on the overhang with real play sessions. Tune heavy vehicles as arcade behavior, never as real-world performance.
- Measure peak traffic, snapshots and rendering with occupied ferry and active games before making capacity or performance claims. Local tests and room smoke checks do not establish production, sustained or mobile capacity.
