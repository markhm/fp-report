# Changelog

All notable changes to **fp-report** are recorded here. Dates are `YYYY-MM-DD`.
The report is regenerated from live fp state, so "changed" here means the engine,
template, or tooling — not the issue data a given report happens to show.

## [Unreleased]

### Added
- **Global search** at the top of every report — matches across issue **id, title, and
  spec (description)**, ANDs space-separated terms, ranks id/title hits above spec hits,
  highlights matches, and hides the dashboard while searching. Tap a result to expand its
  full spec. Built for looking up specced tasks on the go.
- **Mobile layout (iPhone Pro class, ~390–430px).** One responsive template, still a
  single self-contained HTML file — no separate mobile build:
  - the Issues table becomes stacked **cards** (labelled field rows) instead of a wide
    horizontal scroll;
  - epic roadmap rows and their child rows reflow to stack cleanly;
  - a sticky search bar, roomier tap targets, and 2-up KPI tiles.
- **Tap-to-copy an issue id** on touch devices (long-press-free), plus explicit copy
  chips on search results. Desktop right-click-to-copy is unchanged.
- **`fp-report-deploy.sh`** — generate the report and publish it to a static site repo
  (CloudFlare Pages / any git-triggered host), committing and pushing in one step.
  Config-driven via new `DEPLOY_REPO` / `DEPLOY_SUBDIR` / `DEPLOY_BRANCH` /
  `DEPLOY_REMOTE` keys in a project's `fp-report.conf`. Bootstraps the repo (init on the
  chosen branch, add origin, create the GitHub repo if missing) on first run.

## [0.1.0] — 2026-07-10

### Added
- Initial **fp-report** engine + self-contained HTML template: KPI signals, open-backlog
  composition, an expandable **Epics** tab, a filterable/sortable **Issues** tab, and
  dependency signals. Read-only; never mutates fp.
- Shared engine + template, per-project config (`fp-report.conf`, `fp-report.status.json`,
  themes, logos) with layered config discovery.
- `--init` project scaffolding; navy/gold and graphite themes; `export.sh` offline bundle.
- Test suite (`test/run.sh`) rendering fixtures through the engine, run in CI on every push.
- Source guard + extracted `cmd_init`/`main()` so the engine can be sourced for unit tests.
