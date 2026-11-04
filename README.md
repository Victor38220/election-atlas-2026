# Election Atlas · 2026

Interactive election dashboard for the **35 U.S. Senate contests** and **36 state governor elections** on November 3, 2026. The national map shows both offices together: Senate on the left half of each state, governor on the right. Click a state to expand directly into its county map. Compact cards show the Polling Forecast favorite and only that candidate’s Kalshi and Polymarket prices. Polling, model forecasts and market prices remain separate measurements. No election winner is inferred from a price or forecast.

Live: https://election-atlas-2026.election-atlas-2026.workers.dev

Repository: [Victor38220/election-atlas-2026](https://github.com/Victor38220/election-atlas-2026).

## How it runs

- **Cloudflare Worker:** serves the built React application and a public, GET-only proxy for explicitly allowed provider hosts and paths. The proxy solves browser CORS restrictions and briefly caches successful responses for 20 seconds. It holds no API keys or private credentials.
- **Open dashboard:** attempts a live refresh on load, then at the next wall-clock `:00` and `:30` boundaries for markets. Forecasts and individual polls refresh every ten minutes, matching provider caching. Hidden tabs pause refresh and refresh when visible again. Browser suspension, network delays, provider caching and rate limits can delay updates; this is not a guaranteed real-time feed.
- **GitHub archive:** a separate Action runs at minutes `7,22,37,52`. Python refreshes markets when 15 minutes have passed and polling/candidate metadata when a day has passed. It validates and commits changed JSON, preserving actual observed market history for 21 days. It does not redeploy Cloudflare and is independent of visitors or the local computer.
- **Resilience:** the page starts from a real bundled snapshot, checks the GitHub archive and keeps the most recent successful browser data in local storage. Sources refresh independently. A failed fetch retains the previous successful data and timestamp. Missing data is `null`, never a zero probability.
- **History:** archived observations use 15-minute buckets for 24 hours and hourly buckets thereafter. Browser observations use five-minute buckets for the latest day and hourly buckets thereafter. Only observed prices appear; historical prices are never backfilled with invented points.

The design uses Cloudflare **Workers Free** and a public GitHub repository. No paid plan, database, custom domain, payment card, or always-on computer is needed. Stay on the Free plan; quotas and availability still apply. See [Cloudflare’s no-card offer](https://www.cloudflare.com/products/workers/) and [Free limits](https://developers.cloudflare.com/workers/platform/limits/). A deployment account is required.

## Local development

Use Node.js 22+ and Python 3.9+ (the archive Action uses 3.12).

```sh
npm ci
npm run build
npx wrangler dev
```

Open the local URL Wrangler prints. This runs the static app and `/api/*` proxy together. `npm run dev` starts the Vite UI server alone; live proxy requests require Wrangler, so use it for full integration testing.

```sh
npm test
npm run lint
npm run build
npm run test:e2e
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python -m pytest
```

Playwright may require `npx playwright install chromium` before the first run. API fixtures are recorded source responses, not production sample data.

## Deploy to Cloudflare

1. Create a free Cloudflare account and complete account verification.
2. Run `npx wrangler login` and approve the browser authorization.
3. Run `npm ci && npm run build`.
4. Run `npx wrangler deploy` and open the returned `workers.dev` URL.

`wrangler.jsonc` configures static assets, the proxy and SPA fallback. No environment secrets or service bindings are required. There is no automatic Cloudflare deployment workflow: run the build and deploy commands after changing application code. Archive data updates do not require redeployment because the application reads the public repository through `/api/archive/*`.

For a fork, change the repository path in `worker/index.ts` from `Victor38220/election-atlas-2026` to the fork before deploying. Change the Worker name if needed.

## Archive setup and manual refresh

In GitHub, enable Actions for the repository. The archive workflow requires only `contents: write` through the built-in `GITHUB_TOKEN`; there are no provider secrets. It serializes runs and commits only changed generated files. GitHub can delay scheduled jobs and can disable scheduled workflows after repository inactivity; check the Actions tab if archived observations stop.

Run **Actions → Archive election data → Run workflow**. Select `force` to refresh daily polling and candidate metadata too. Locally:

```sh
.venv/bin/python -m scripts.update_data
.venv/bin/python -m scripts.update_data --force
```

Inspect the provider status summary, then commit changed `public/data` and `config` files. The UI refresh button rechecks live sources without writing to GitHub.

## Sources and observed coverage

The initial successful ingestion collected 71 forecasts, 1,569 deduplicated individual polls and 276 verified contracts. It found 141 Kalshi contracts and 135 Polymarket contracts, with 97 and 93 usable two-sided quotes respectively at that observation. These are **initial observation counts**, not promises of current live coverage; election-night markets can close or lose their books. The dashboard shows current coverage and source statuses.

- **Polling Forecast:** live `/senate`, `/governors`, both race polling feeds and `/pollsters` were exercised. Its reported polling margin, modeled margin and modeled win probability are stored separately. The source caches for ten minutes, so more frequent browser requests need not produce new polling information.
- **VoteHub:** `/poll-types` revealed `us-senator` and `governor`; Senate-specific polling was fetched and candidate/state identities checked. Generic-ballot records never become state race polling. Overlapping polls are deduplicated. Browser access uses the Cloudflare proxy.
- **Kalshi:** discovery used actual Elections series and paginated markets, then deterministic year/state/office/outcome/resolution validation. Known IDs survive for closed-market retrieval. Dollar bid/ask midpoints are used only for active, reasonably narrow, two-sided books; raw last trades are retained but not substituted as fresh quotes. Contract metadata update time is not claimed as quote time.
- **Polymarket:** public event search, event/market metadata and batch CLOB midpoints were exercised during initial ingestion. The live browser adapter refreshes the verified Gamma markets and calculates valid bid/ask midpoints. Legacy token IDs and structured token/position metadata are distinguished; unsupported position-only pricing is unavailable rather than guessed.

## Important coverage limits

- County views show **November 3, 2026 only**. The official Georgia Secretary of State feed supplies all 159 counties for both Senate and governor. The North Carolina State Board of Elections feed supplies all 100 counties for the Senate election. The California Secretary of State feed supplies all 58 counties for the governor election; at the verified observation it was initialized with zero votes, so those counties show awaiting reports with null vote shares. Other states or offices have no connected live county feed and remain unavailable. County maps do not display historical election returns, polling estimates, or market prices.
- The map covers all 50 states, 35 Senate elections and 36 **state** governorships. Territorial gubernatorial elections are not included.
- Candidates reflect Polling Forecast’s principal outcomes, not a verified complete ballot. Independent candidates retain their own party and are not automatically assigned a Democratic caucus alignment.
- Kalshi contracts often settle on a senator being sworn in; Polymarket contracts often settle on media consensus or official certification. **No cross-provider comparison group is approved automatically.** Both prices may be displayed, but subtraction is disabled unless explicit compatible-outcome review overrides exist in `config/market-mappings.json`.
- A market may have no valid book, be closed, be unsupported, or be absent. Quote availability does not establish an official result. Market prices can reflect spreads, liquidity, fees and different rules; independently listed YES prices need not sum to 100%.
- National statistics summarize observed coverage and named provider ratings. They are not a proprietary forecast or a statistically valid probability of Senate control.
- A failed source stays visibly stale. Stored and bundled data can remain useful even if all providers fail; the first page load still requires the hosting service.

## Project layout

`src/` contains typed live adapters, analytics, map, county explorer, charts and UI. `worker/index.ts` contains the fixed-host proxy. `scripts/` contains Python provider adapters, Pydantic models, reconciliation and archive collection. `config/races.json` is the canonical race roster; `config/market-mappings.json` keeps exact accepted IDs and explicit overrides. `public/data/` contains the real normalized snapshot, observed history, provider metadata and current 2026 county files under `live-counties/`. `tests/fixtures/` preserves small recorded responses for offline tests.

See [ATTRIBUTION.md](ATTRIBUTION.md) for provider and row-specific data licensing.

## Reported 2026 vote counts

The Results view uses [Open America’s documented free API](https://openamerica.io/elections/api/), which passes through counts from official state election offices. Live calls verified both Senate and Governor responses with nine state races each on November 3, 2026. This is partial coverage, and no county breakdown is exposed by that API. Results refresh once per minute through a 60-second Cloudflare cache. The source timestamp remains visible; a reported leader is never labeled a certified winner. Reporting percentages describe the source’s reporting units, which can be precincts, counties, or localities, and do not measure votes counted. Exit-poll survey data is separate from reported vote counts; the dashboard links to publisher coverage because no free, documented 2026 demographic exit-poll API was verified.

## Focused views

The default view keeps the map, model favorites, polling margins and two market prices together. Full polls, trend charts and resolution terms are available through each race’s details button. Election results are a separate map lens using reported ballot leaders, never model favorites or race calls. County maps use separate official 2026 county feeds for Georgia Senate and governor, North Carolina Senate, and California governor; statewide Open America totals are never substituted for county counts. Unsupported states and offices show unavailable coverage. County polling and prediction-market contracts are unavailable, and no statewide estimate is copied onto a county. Exit polls have their own view: one explicitly dated, attributed national published reading and links to current publisher reports. That recorded reading does not auto-refresh; no free state/county exit-poll API was verified.

## Live county sources

- **Georgia Senate and governor:** [Georgia Secretary of State election results](https://results.sos.ga.gov/), through its public 2026 general-election feeds. All 159 counties were verified for each office. The two contests remain separate, and reported leaders are not race calls.
- **North Carolina Senate:** [North Carolina State Board of Elections](https://er.ncsbe.gov/), using its published 2026 general-election county metadata, candidates, and county contest results. All 100 counties were verified. Counts remain unofficial pending the canvass and certification.
- **California governor:** [California Secretary of State election media files](https://media.sos.ca.gov/) and its [documented governor JSON](https://media.sos.ca.gov/media/governor.json). All 58 county identities match Census FIPS geography. The source’s original reporting time is preserved as published; retrieval time is separate. The verified source was initialized with zero votes, which is shown as awaiting reports with no vote-share estimate.

County data is fetched while its state view is open, with minute refresh and short Cloudflare caching. A source failure retains the last actual 2026 observation and its source time. County geometry is geographic context only; no older election results are served as a fallback.
