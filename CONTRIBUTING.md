# Contributing to Poly AV

Issues and pull requests are welcome. Keep the game immediately playable and optimize for simple fun. Before starting a large change, open an issue to discuss its scope.

1. Fork and clone the repository; use Node 22 and pnpm 10.33.1 (`corepack enable` if needed).
2. Run `pnpm install --frozen-lockfile`, `pnpm build`, then `pnpm dev:server` and open http://localhost:8787. For hot reload, also run `pnpm dev` and open its Vite URL.
3. Make a focused change and run `pnpm run ci`. For networking changes, also run `pnpm exec tsx tests/room.integration.ts http://localhost:8787` against the local Worker. Visual changes should be checked in the game at desktop and phone-sized portrait/landscape viewports.
4. Open a pull request explaining the player-facing behavior, checks performed, and any limitations. Link an issue if there is one.

Read [agent contracts](docs/CONTRACTS.md), [map contract](docs/MAP.md) and [asset brief](docs/ASSETS.md) before changing shared simulation, geography or visuals. Update protocol and tests together. Use original or appropriately licensed assets with source and license information; do not contribute company logos, artwork or music without permission. Contributions are submitted under the project's MIT license. Product and company names remain their owners' marks.

Do not commit credentials, player data or Cloudflare tokens. See [deployment](docs/DEPLOYMENT.md) for a separate Worker and previews. To report a security issue privately, choose “Report a vulnerability” in the [repository's Security tab](https://github.com/swyxio/TeslaRoadster6/security); do not post exploit details in a public issue.
