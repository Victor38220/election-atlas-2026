# Election Atlas · 2026

Interactive election dashboard for the **35 U.S. Senate contests** and **36 state governor elections** on November 3, 2026. The national map shows both offices together: States with both races split Senate on the left and governor on the right. A state with one race uses its entire shape. Solid colors identify explicit Associated Press calls; uncalled reported leaders are hatched. Click a state to expand directly into its county map. The national map and primary race cards show the leader in actual reported 2026 votes and that candidate’s current vote share. A leader is not a race call. Cards show Kalshi and Polymarket quotes only when they match that same candidate; a missing count or unmatched contract stays unavailable. Model probabilities appear as secondary context in race details and never substitute for a missing reported count. Polling, model forecasts, counted vote shares, and market prices remain separate measurements.

Live: https://election-atlas-2026.election-atlas-2026.workers.dev

Repository: [Victor38220/election-atlas-2026](https://github.com/Victor38220/election-atlas-2026).

## How it runs

- **Cloudflare Worker:** serves the built React application and a public, GET-only proxy for explicitly allowed provider hosts and paths. The proxy solves browser CORS restrictions. Market responses cache for 20 seconds; the shared national and county result feeds cache for 30 seconds. Fallback official feeds retain their own minimum intervals: most 60 seconds, Arizona 120 seconds and Ohio 180 seconds. It holds no API keys or private credentials.
- **Open dashboard:** attempts a live refresh on load, then at the next wall-clock `:00` and `:30` boundaries for markets, reported vote counts and regional results. Forecasts and individual polls refresh every ten minutes, matching provider caching. Hidden tabs pause refresh and refresh when visible again. Browser suspension, network delays, provider caching and rate limits can delay updates; this is not a guaranteed real-time feed.
- **GitHub archive:** a separate Action runs at minutes `7,22,37,52`. Python refreshes markets when 15 minutes have passed and polling/candidate metadata when a day has passed. It validates and commits changed JSON, preserving actual observed market history for 21 days. The Node22 collector also preserves all 71 statewide race records, explicit AP calls, and all 45 states’ current regional reports for offline/API-failure resilience. It does not redeploy Cloudflare and is independent of visitors or the local computer.
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
node --experimental-strip-types scripts/refresh_national.ts
node --experimental-strip-types scripts/refresh_notable.ts
node --experimental-strip-types scripts/refresh_notable_results.ts
```

Inspect the provider status summary, then commit changed `public/data` and `config` files. The UI refresh button rechecks live sources without writing to GitHub.

The workflow also runs `scripts/refresh_notable.ts` and `scripts/refresh_notable_results.ts`. `notable-races.json` saves the ranked notable-race response, including available markets and polls. `notable-results.json` saves the raw publisher records for the currently archived notable House races and Los Angeles mayor, with a separate fetch time for each source. `notable-archive-status.json` records the most recent notable-race collection attempt. The collector retains the last complete notable snapshot when a ranking is incomplete; it retains a failed results section independently. If Polymarket explicitly fails, its last observed Los Angeles market is carried forward and marked as retained. When a polling source explicitly fails, the archive carries forward the last observed polls for matching races and marks them as retained; a successful empty response clears prior polls. A fully retained snapshot keeps its original update time. GitHub history preserves committed versions, but the current files are snapshots, not a complete record of every upstream change. A race that leaves the ranked list is no longer included in that snapshot. Optional sources can be absent on an initial collection, and source availability and scheduled execution are not guaranteed.

## Sources and observed coverage

The initial successful ingestion collected 71 forecasts, 1,569 deduplicated individual polls and 276 verified contracts. It found 141 Kalshi contracts and 135 Polymarket contracts, with 97 and 93 usable two-sided quotes respectively at that observation. These are **initial observation counts**, not promises of current live coverage; election-night markets can close or lose their books. The dashboard shows current coverage and source statuses.

- **Polling Forecast:** live `/senate`, `/governors`, both race polling feeds and `/pollsters` were exercised. Its reported polling margin, modeled margin and modeled win probability are stored separately. The source caches for ten minutes, so more frequent browser requests need not produce new polling information.
- **VoteHub:** `/poll-types` revealed `us-senator` and `governor`; Senate-specific polling was fetched and candidate/state identities checked. Generic-ballot records never become state race polling. Overlapping polls are deduplicated. Browser access uses the Cloudflare proxy.
- **Kalshi:** discovery used actual Elections series and paginated markets, then deterministic year/state/office/outcome/resolution validation. Known IDs survive for closed-market retrieval. Dollar bid/ask midpoints are used only for active, reasonably narrow, two-sided books; raw last trades are retained but not substituted as fresh quotes. Contract metadata update time is not claimed as quote time.
- **Polymarket:** public event search, event/market metadata and batch CLOB midpoints were exercised during initial ingestion. The live browser adapter refreshes the verified Gamma markets and calculates valid bid/ask midpoints. Legacy token IDs and structured token/position metadata are distinguished; unsupported position-only pricing is unavailable rather than guessed.

## Important coverage limits

- Regional views show **November 3, 2026 only**. One shared public publisher supplies all 71 statewide contests and regional records across all 45 states with tracked elections. Forty-four states have compatible county records, including town-to-county sums where the publisher supplies county FIPS. Alaska uses its 40 House election districts with matching Census district boundaries, explicitly labeled as districts. Hawaii supplies four of five map counties. Unassigned overseas votes and temporary county/state discrepancies remain unallocated. Missing records stay gray; actual zero counts show awaiting reports with null shares. County maps never substitute historical returns, polling estimates, market prices or model estimates.
- The map covers all 50 states, 35 Senate elections and 36 **state** governorships. Territorial gubernatorial elections are not included.
- Forecast candidates reflect Polling Forecast’s principal outcomes, not a verified complete ballot. Reported results retain the candidates, tickets, and party labels supplied by the relevant election feed. Independents retain their own party and are not automatically assigned a Democratic caucus alignment.
- Kalshi contracts often settle on a senator being sworn in; Polymarket contracts often settle on media consensus or official certification. **No cross-provider comparison group is approved automatically.** Both prices may be displayed, but subtraction is disabled unless explicit compatible-outcome review overrides exist in `config/market-mappings.json`.
- A market may have no valid book, be closed, be unsupported, or be absent. Quote availability does not establish an official result. Market prices can reflect spreads, liquidity, fees and different rules; independently listed YES prices need not sum to 100%.
- National statistics summarize observed coverage and named provider ratings. They are not a proprietary forecast or a statistically valid probability of Senate control.
- A failed source stays visibly stale. Stored and bundled data can remain useful even if all providers fail; the first page load still requires the hosting service.

## Project layout

`src/` contains typed live adapters, analytics, map, county explorer, charts and UI. `worker/index.ts` contains the fixed-host proxy. `scripts/` contains Python provider adapters, Pydantic models, reconciliation and archive collection. `config/races.json` is the canonical race roster; `config/market-mappings.json` keeps exact accepted IDs and explicit overrides. `public/data/` contains the real normalized snapshot, observed history, provider metadata and current 2026 county files under `live-counties/`. `tests/fixtures/` preserves small recorded responses for offline tests.

See [ATTRIBUTION.md](ATTRIBUTION.md) for provider and row-specific data licensing.

## Reported 2026 vote counts

The Results view reads The New York Times’ publicly accessible election JSON through the fixed-host Cloudflare proxy: `results-senate.json`, `results-governor.json`, and `results-{state-name}.json` under `https://static01.nyt.com/elections-assets/pages/data/2026-11-03/`. Live responses were validated for 35 Senate races (including Florida and Ohio special-general contests), 36 governor races, and all 45 relevant state pages. The default browser requests align to :00 and :30; caching and upstream reporting may delay a change. Source update time and retrieval time remain separate. Individual county update times are not supplied and are not invented.

Only `candidates[].votes.total` and published `total_votes` enter vote displays. Final-outcome model, polling, image and editorial fields are excluded. Source counting-progress estimates and expected-turnout weights are used only for the separately labeled estimated-vote-in metric. A call is labeled AP only when `outcome.called_by` explicitly includes `ap`, `outcome.won` identifies one candidate, and the canonical race identity matches. A NYT-only or CNN-only call does not become an AP call. `winner_accepted_at` is labeled as the call record’s acceptance time, not the exact AP decision time. Successful refreshes can remove retracted calls; failed office refreshes retain the prior observed records and timestamps.

The minimum working publisher set for counts and AP call metadata is one. This is public keyless retrieval, not a claim of a blanket reuse licence or a guaranteed service. Named source attribution and original result-page links remain visible. The older official-state and secondary-mirror adapters remain available as fallbacks. Full per-state evidence and the minimal source analysis are in `docs/county-sources/`; the generated machine-readable coverage summary is `public/data/county-coverage.json`.

## Focused views

The national map uses solid party color for explicit AP calls, hatching for uncalled reported leaders, and gray for unavailable counts. It splits only states holding both tracked races. Primary cards show each reported leader, their actual share of counted votes, and only matching market quotes. No result means no leader; a model favorite never fills that gap. Full polls, forecasts, market trend charts, and resolution terms remain in race details. Regional maps read their own published county or district observations; statewide totals are never copied onto individual areas. Unsupported areas remain unavailable. County polling and prediction-market contracts are unavailable.

When a complete connected official county feed supplies a state, the dashboard may sum distinct county records separately for each office and candidate to display its reported totals. This is an arithmetic total of observed votes from one source, not a projection, race call, or estimate of how many ballots remain. Duplicate county identities and partial provider responses are excluded from that aggregation. Source times remain attached to the reports; retrieval time is separate.

Exit polls have their own view: one explicitly dated, attributed national published reading and links to current publisher reports. That recorded reading does not auto-refresh; no free state/county exit-poll API was verified. Exit-poll survey percentages never replace counted election votes.

## Fallback county sources

The primary shared feed covers all 45 relevant states, with 30-second requests. The following separately verified adapters are retained for fallback use; their intervals apply when a fallback is used.

| State | Office coverage | Verified county or locality coverage | Refresh while open |
|---|---|---:|---|
| Georgia | Senate and governor | 159 counties for each office | 60 seconds |
| North Carolina | Senate | 100 counties | 60 seconds |
| California | Governor | 58 counties; this fallback was initialized without votes at its recorded observation | 60 seconds |
| Arizona | Governor and lieutenant governor ticket | 15 counties | 120 seconds |
| Virginia | Senate | 133 counties and independent cities | 60 seconds |
| Ohio | Senate and governor | 88 counties for each office | 180 seconds |
| Colorado | Senate and governor | 64 counties for each office | 60 seconds |
| Minnesota | Senate and governor | 87 counties for each office | 60 seconds |
| Texas | Senate and governor | 254 counties for each office; counties without reported votes stay gray | 30 seconds, aligned to :00 and :30 |

- **Georgia:** [Secretary of State election results](https://results.sos.ga.gov/), through public general-election metadata and separate Senate/governor county-breakdown feeds.
- **North Carolina:** [State Board of Elections](https://er.ncsbe.gov/), through published 2026 county metadata, candidates, and federal contest results.
- **California:** [Secretary of State election media files](https://media.sos.ca.gov/) and the [documented governor JSON](https://media.sos.ca.gov/media/governor.json). The original reporting time is preserved verbatim. Initialized zero-vote records show awaiting reports with no vote-share estimate.
- **Arizona:** [Secretary of State public election results](https://app.enhancedvoting.com/results/public/Arizona/elections/110326GeneralElection), through the verified governor-ticket county breakdown. The [official media guidance](https://azsos.gov/press) requests downloads no more often than once every two minutes.
- **Virginia:** [Department of Elections results](https://enr.elections.virginia.gov/results/public/virginia/elections/2026-November-General), through the U.S. Senate county/locality breakdown. Independent cities retain their separate FIPS identities.
- **Ohio:** [Secretary of State live results](https://liveresults.ohiosos.gov/), through official election XML. County reporting units remain distinct from similarly named electoral districts. The feed is requested every three minutes.
- **Colorado:** [Secretary of State election results](https://results.enr.clarityelections.com/CO/127407/web.345435/), using its current version pointer and official county-detail XML ZIP. The browser decompresses the ZIP locally; source time retains its published time-zone label.
- **Minnesota:** [Secretary of State 2026 results files](https://electionresultsfiles.sos.mn.gov/20261103/allracesbycounty.txt), with the official county reference table. The proxy preserves the source’s Last-Modified header rather than inventing an update time.
- **Texas:** [Texian Partisan’s public election-results mirror](https://texianpartisan.com/election-night-2026/) republishes Texas Secretary of State county returns through separate general-election Senate and governor JSON endpoints. The direct state API returned HTTP 403 during verification. The dashboard explicitly labels this a secondary mirror and preserves both original source update and mirror collection timestamps. Harris County Senate and governor candidate counts were cross-checked against its [official county JSON](https://appfiles.harrisvotes.com/harrisvotes/prd/Data/1126/resultsbyballot.json); another independent public mirror also confirmed county records. Mirror reporting-unit counts may differ from a county’s own site. A complete set of 254 county records includes awaiting counties; it does not mean all ballots are counted. The archive workflow preserves the last validated Texas observation every 15 minutes; open Texas views request fresh data every 30 seconds.

County data refreshes while its state view is open. A source failure retains the last actual 2026 observation and its source time. Precincts, counties, and localities are reporting units, never a claim about the fraction of all votes counted. Counts remain unofficial pending canvass and certification. County geometry provides geographic context only; no older election returns are served as a fallback.

Minnesota’s official download host is reachable by the GitHub runner but returns origin timeouts from Cloudflare. The archive workflow collects and validates that feed about every15minutes; the browser reads the shared normalized mirror. Both original source time and actual collector fetch time remain visible. GitHub scheduling can be delayed. This applies to the Minnesota fallback only; the primary shared Minnesota feed is requested every 30 seconds.

## Congress seat charts and vote-counting progress

The **Congress** tab follows the Senate and all 435 voting House districts. It draws 100 Senate dots (65 continuing seats plus 35 elections) and 435 House dots. Continuing Senate seats use the publisher’s validated 65-seat baseline; “Democratic / aligned” explicitly includes caucusing independents. New election seats count only when the source explicitly attributes the call to AP. Uncalled races stay gray; publisher-designated gains after an AP call are outlined and listed separately. Party control is not inferred from modeled seat forecasts. The Senate marker means 51 seats for an outright majority; it does not model a vice-presidential tiebreak.

House ingestion excludes the source’s national aggregate, includes Louisiana’s six nonpartisan general contests, and validates every state’s apportioned district set before accepting all 435. Partial/failed source refreshes retain the last complete chamber observation. The public House feed is requested only while the Congress tab is open; browser requests align to :00 and :30. The scheduled collector also saves the normalized `public/data/congress.json` snapshot.

State and regional details separately show **estimated vote in**, using the publisher’s EEVP percentage, stored internally as a 0–1 fraction. It is an estimate of counting progress, not a candidate’s vote share or precinct-reporting fraction. For New England county rollups, published town EEVPs are weighted by the source’s expected town vote totals; the UI labels these “NYT town rollup.” If any required estimate or weight is absent, the county estimate stays unavailable. Expected vote estimates never replace actual candidate vote totals.

## Other races to watch

The national view includes up to five additional contests, ranked by lifetime Kalshi contract count across the 2026 House general-election markets and the Los Angeles mayoral general-election market. This is a deliberately limited universe, not a ranking of every US election or of news coverage. The Los Angeles entry also shows Polymarket when its verified event is available; its dollar-denominated volume is displayed separately and does not affect the Kalshi ranking. Market last trades are informational, may be stale, and are not election results. House contracts that settle on the party sworn into office are labeled by party rather than by the exchange's candidate subtitle.

While the national view is open, the browser checks the worker at :00 and :30 and retains the last successful observation if a refresh fails. The edge caches complete responses for 30 seconds. Partial source coverage is identified in the section, and no news feed is currently used to rank races.
