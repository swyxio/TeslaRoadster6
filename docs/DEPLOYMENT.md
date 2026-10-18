# Cloudflare deployment and previews

The game uses one Worker for the Vite assets and API, with one Durable Object per multiplayer room. The checked-in `wrangler.jsonc` names the existing production Worker `bay-drive`. Room state is ephemeral; a deployment, runtime restart or last disconnect can reset it. Rooms are public by code, not private, and active rooms incur Durable Object and WebSocket usage.

The project's [production game](https://bay-drive.swyxio.workers.dev) and [staging preview](https://staging-bay-drive.swyxio.workers.dev) are public. Cloudflare Workers Builds is connected to the public repository: pushes to `main` build and deploy production, while pushes to `staging` build and deploy that preview. Staging does not automatically follow `main`.

## Deploy your own copy

1. Fork the repository. Install Node 22 and pnpm 10.33.1, then run `pnpm install --frozen-lockfile` and `pnpm run ci`.
2. Log into your own Cloudflare account with `pnpm exec wrangler login`. In your fork, change `name` in `wrangler.jsonc` to a Worker name in your account. Keep the asset binding, Durable Object binding and migration.
3. Run `pnpm exec wrangler deploy`. Visit the `workers.dev` URL returned by Wrangler and test automatic room entry and a two-client room. This can incur account usage charges.

## Native Workers Builds

Cloudflare [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) connects an existing Worker to a GitHub repository. The project is configured as follows:

| Setting | Value |
| --- | --- |
| Worker / production branch | `bay-drive` / `main` |
| Root directory | repository root |
| Build command | `pnpm run ci` |
| Production deploy command | `pnpm exec wrangler deploy` |
| Preview command | `pnpm exec wrangler preview` |
| Build variable | `PNPM_VERSION=10.33.1` |

Workers Builds installs dependencies based on the pnpm lockfile. `.nvmrc` selects Node 22.23.2. Enable preview builds for non-production branches. The production command runs only after the tests and build succeed. Cloudflare creates GitHub check runs and can post preview links on pull requests; branch/fork behavior depends on the GitHub App's access and Cloudflare settings.

To update the shared staging preview to a tested commit, push that commit to the `staging` branch (for example, `git push origin main:staging` when that is a fast-forward). Check the staging build and exercise the preview before sharing it. Other non-production branches get their own preview rather than updating the shared staging URL.

The dedicated `bay-drive Workers Builds` user token has Workers Scripts edit and Account Settings read for the Cloudflare account. Workers Scripts edit is account-wide, so anyone able to execute a build with that token has access to other Workers in the account. Review changes to build scripts and restrict who can push to build-triggering branches; do not place untrusted contributor code in a privileged build without review.

The checked-in `previews` block supplies `MAX_PLAYERS` and the `ROOMS` and `CHAT` bindings separately. Previews permit up to 128 synthetic clients for capacity experiments; production remains capped at 64. Neither setting guarantees playable capacity. Cloudflare [automatically isolates each Preview's Durable Object namespace](https://developers.cloudflare.com/workers/previews/resources/); preview rooms, chat and saved identities do not join production. Worker Previews are a Cloudflare open beta. A preview URL is shareable, not an access-control mechanism. Previews and production have separate settings: if new bindings or secrets are added, configure preview-safe equivalents explicitly. Do not put production secrets in previews or Git.

For setup, open the Worker in Cloudflare Dashboard → Settings → Builds → Connect, authorize the Cloudflare Workers & Pages GitHub App for the repository, and enter the settings above. Push a commit, inspect its build and active deployment, then exercise a two-client room. Test a non-main branch and its Preview independently. A green static build alone does not verify WebSocket multiplayer or resource isolation. See [Cloudflare build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/) and [Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/).

For a manual Preview, after building run `pnpm exec wrangler preview --name <branch-name>`; it targets the Worker named in your config. Use a test room code and never run it against an account or Worker you do not control. `pnpm run deploy` is a manual production deployment and should be reserved for maintainers when needed.

## Operate and roll back

Watch the Worker's Deployments and build logs in Cloudflare. If a production deployment regresses, use Cloudflare's deployment history to roll back to a known good version; coordinate client/server protocol changes and communicate any room resets. Full snapshots and all-pairs collision handling limit scaling; the default 64 players is a provisional per-room cap, not a capacity guarantee. Review [verification](VERIFICATION.md) before changing it or promoting the game broadly.
