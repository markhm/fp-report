# Changelog

All notable changes to **fp-report** are recorded here. Dates are `YYYY-MM-DD`.
The report is regenerated from live fp state, so "changed" here means the engine,
template, or tooling — not the issue data a given report happens to show.

## [Unreleased]

### Changed
- **The template is now a directory of parts** (`template/`): the page shell plus
  `styles/*.css` and `app/*.js`, inlined at render time via `<!--#include path -->`.
  The output is unchanged — still one self-contained HTML file, verified byte-identical
  to the previous monolith — but the 880-line file is now eleven files of 10–210 lines.
  The engine aborts on a missing include, and on a directive that isn't alone on its line
  (which cannot be substituted and would otherwise ship as a literal comment).
- `install.sh` and `export.sh` moved to `tools/`. The engine itself did not move, so
  existing `~/bin/fp-report` symlinks keep working — only the install/export commands
  gain a `tools/` prefix.

### Added
- **Orphans tab** (after Issues) — work left behind in a closed epic: an issue whose
  parent is terminal (`done` or `rejected`) while it is not. Grouped by the epic that
  closed, because that is the unit of the fix — re-home the list, or close it. Nothing
  else in the report surfaces this work: the Epics tab lists only epics with open
  children, and on the Issues tab these rows are hidden by the default `no parent`
  filter. Two calls the tab makes for you: a `deferred` child counts as stranded (it
  will never be picked up either), and only the *direct* parent is tested, so a
  still-open sub-epic is the orphan rather than everything beneath it. Also surfaced as
  an `Orphaned — under a closed epic` KPI signal.
- **Themes tab** — a new first/default page of tiles that groups the whole backlog into
  themes. Each tile carries a **priority distribution** (critical / high / medium / low /
  unset), every row a bar **segmented by status**, scaled against the largest row across
  the whole grid so bar length is comparable between tiles. Tiles are grouped by *facet*
  (Quality / Area / Work type, configurable) and clicking one jumps to the Issues tab
  filtered to that theme.
  - **hide done** now also drives the tiles, and **ships ticked**: they open on live work
    only, so a mostly-complete backlog stops flattening every theme into the same shape.
    Headline, legend, footer and bar scale all follow the toggle.
  - The taxonomy is per-project data (`fp-report.themes.json`, `THEMES_FILE`), meant to
    mirror the project's `.fp/extensions/labels` vocabulary.
  - Every issue lands in **exactly one theme per facet**, so tiles always partition the
    backlog. Resolution order: **fp label → inherited from its epic → keyword match →
    unthemed**, with the page footnoting how many issues came from each source. Labels
    always win, so labelling an issue is how you correct a tile.
  - Added a **theme filter** to the Issues tab, following the selected facet.
  - Tiles count **leaf work items**; epics are reported separately as `N epics (M open)`.
    An epic's status is a roll-up of its children, so counting both double-counts the
    same work — that alone put 8 phantom items into MC's WIP figure.
  - **Epic-scoped priority is kept distinct.** Inside an epic, "critical" ranks a
    sub-issue against its siblings, not against the backlog; the epic roadmap already
    scores epics by their own priority for this reason. Each priority row's tooltip
    splits its count into top-level versus epic-scoped.
  - A sub-issue **follows its epic's theme** unless it carries its own label, so one
    initiative stays in one tile instead of fragmenting across five.
- **Label enrichment.** `fp issue list` omits `properties`, so the engine now fetches
  each issue's labels via parallel `fp issue show` calls and caches them by `updatedAt`
  next to the report — a cold run on ~1000 issues takes about a minute, later runs under
  a second. `--no-labels` skips it; `--refresh-labels` ignores the cache.
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
