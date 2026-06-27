Original prompt: 按照文档要求开始实现，遇到问题不要采用妥协方案，要么停止要么问我

## Progress

- Initialized an empty workspace as a full-stack H5 project for 《今生我要修成仙》.
- Hard requirement tracked: player progression is persisted on the server; browser storage must not be used as the gameplay save.
- Selected Node's built-in SQLite for local server persistence after verifying `node:sqlite` is available.
- Implemented core first-slice systems: realm/cultivation/breakthrough, server idle settlement, talent/root reroll, passive techniques, trial tower, async arena bots, spirit vein, equipment/inventory, artifacts, daily login, mail shell, settings, and linear novice guide.
- Implemented mobile-first H5 UI with the required main entries: 修炼台、藏经阁、试炼塔、仙战、背包, plus 更多 for 灵脉/商城/邮件/设置.
- Added `window.render_game_to_text` and `window.advanceTime` for automated game verification.
- Verification passed:
  - `npm run build`
  - `npm run verify:flow`
  - `npm run test:game`
- Began Vercel deployment work:
  - Added Vercel API Routes under `api/`.
  - Added Upstash Redis/KV persistence adapter for Vercel serverless storage.
  - Added `vercel.json`.
  - `npm run build` passes after the Vercel changes.
  - Upstash KV resource `xiuxian-game-save` is connected to Vercel project `xiuxian-game`.
  - Preview deployment is ready:
    https://xiuxian-game-oc9rtbf6l-owenzhao99s-projects.vercel.app
  - Fixed preview loading failure reported by user:
    - Cause 1: Vercel Node ESM functions could not resolve extensionless imports like `../server/vercelHandlers`.
    - Cause 2: project SSO deployment protection intercepted `/api/state`.
    - Fix: local server/shared/API imports now use `.js` extensions for Vercel runtime, and SSO deployment protection is disabled for public preview access.
    - Verified latest preview and stable alias:
      https://xiuxian-game-bhbj17bup-owenzhao99s-projects.vercel.app
      https://xiuxian-game-owenzhao99-owenzhao99s-projects.vercel.app
- Added and deployed Cloudflare Worker version:
  - Worker entry: `cloudflare/worker.ts`
  - Uses static assets from `dist` and handles `/api/state` plus `/api/action` in the Worker.
  - Uses the same Upstash KV REST env vars for server-side save data.
  - URL:
    https://xiuxian-game.open-brain-a0a.workers.dev
  - Temporary Cloudflare account claim URL:
    https://dash.cloudflare.com/claim-preview?claimToken=pLWKJRMnm5cXNksgLDMSSPckfqXF6-_F4jZCKzes9ig
  - Verified:
    - `npm run build`
    - `npx wrangler deploy cloudflare/worker.ts --assets dist --name xiuxian-game --compatibility-date 2026-06-27 --dry-run`
    - Cloudflare `/api/state` returns JSON
    - Cloudflare Playwright smoke test
    - Cloudflare full guide flow via `npm run verify:flow`
- Added and deployed GitHub Pages frontend:
  - Repository:
    https://github.com/OwenZhao9/xiuxian-game
  - Pages URL:
    https://owenzhao9.github.io/xiuxian-game/
  - Pages serves static assets from `gh-pages` and uses the Cloudflare Worker backend for server-side save data.
  - `gh-pages` was force-updated to contain only built static files:
    `.nojekyll`, `index.html`, and `assets/`.
  - Verified:
    - `npm run build:github`
    - GitHub Pages HTML and JS asset HTTP 200
    - Cloudflare API CORS from `https://owenzhao9.github.io`
    - GitHub Pages full guide flow via `npm run verify:flow`
- Fixed GitHub Pages loading screen getting stuck on `今生我要修成仙`:
  - Cause: the GitHub Pages frontend depended on a single cross-origin API endpoint; when that endpoint is slow or unreachable, the app stayed on the initial loading mark.
  - Frontend API requests now have a 5s timeout and try both:
    - `https://xiuxian-game.open-brain-a0a.workers.dev`
    - `https://xiuxian-game-owenzhao99s-projects.vercel.app`
  - The loading screen now shows a retry control if every backend fails, instead of remaining non-interactive.
  - Vercel production API was redeployed with CORS and `X-Xiuxian-Session` support for GitHub Pages.
  - GitHub Pages was redeployed with a new static bundle:
    `assets/index-3nXNe8qm.js`
  - Verified:
    - Vercel cross-origin `/api/state` and `/api/action`
    - GitHub Pages full guide flow via `npm run verify:flow`
    - Simulated Cloudflare API failure; GitHub Pages continued through Vercel fallback
    - Simulated all backend failures; loading screen showed `重试连接`

## Open items

- Payment provider for real first-charge flow is not specified yet. Do not fake a production payment integration.
- Exact official balance tables for 凡境 through 大乘 are not present in the provided document. Current tables are generated from the documented smooth exponential progression and should be replaced if a fixed策划数值表 is supplied.
- Vercel production deployment is active and used as the GitHub Pages fallback API.
- Cloudflare deployment used Wrangler's temporary account flow because this machine is not logged in to Cloudflare. Claim it within the Wrangler-provided window or redeploy after `wrangler login`.
