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
- **Epic and orphan rows show their id as a copy chip.** An issue row's id could always
  be copied (right-click, or a tap on touch devices), but an epic row's could not: its
  id sat in plain text, and a tap expands the epic. The id is now a `.cid` chip that
  copies on click or tap on every device, the row carries `data-id` so right-click
  copies it as on an issue row, and clicking the chip no longer toggles the epic open.
  On touch devices a tap on an epic row still only expands it.
- **The Epic roadmap is sortable** — a key row above the tab offering **Urgency** (the
  previous fixed order, still the default), **Created**, **Last activity** and
  **Progress**; clicking the active key flips its direction, and every key falls back to
  the urgency comparator so ties keep landing in the pressing order. Urgency answers what
  is most *pressing*; it cannot answer how long an epic has been hanging around or when
  anything last moved on it, which is what driving epics to completion needs. **Last
  activity is rolled up over the epic and its direct children**, not read off the epic's
  own `updatedAt`: that timestamp only moves when the epic *record* is edited, so an epic
  whose children all changed yesterday would otherwise report as months idle — on a live
  40-epic backlog the two values differ for 21 of them. Childless "Epic"-titled issues
  fall back to their own `updatedAt`, which for them is the real signal. Each row now
  prints the metrics it is sorted on (`54d old · idle 54d`, `stale` past 14 days) so an
  unfamiliar ordering explains itself, and expanded rows are keyed by epic id rather than
  row position, so a re-sort keeps open what the reader opened instead of whichever epic
  lands in that slot.
- **Trends tab** (after Orphans) — a cumulative flow diagram: how many issues sat in each
  status on every past day, as a stacked area chart. Built by **replaying `fp log`**
  (every `status: A → B`, `issue_created` and `issue_deleted` the project recorded), not
  by interpolating the issue list — a snapshot can only assume each issue held its current
  status since `createdAt`, which draws a flat line for exactly the period you wanted to
  see and back-dates today's completions to the start of the project. The replay's final
  day reconciles **exactly** with the live backlog, status for status, so the chart cannot
  drift from the "By status" bars above it; where it *has* to assume (issues predating the
  log, deleted issues, a live status the log never recorded a move to) the note under the
  chart says so and counts them. Tunable by de-selecting status bands in the legend and by
  narrowing to a theme, plus 30d/90d/All ranges and a table view. New `FETCH_HISTORY` conf
  key, `--no-history` and `--history-file` flags; with no history the tab removes itself.
  The tab-bar `hide done` toggle scopes the chart too — with the done band in the stack it
  is most of the height on a mature backlog and the live queue collapses to hairlines. It
  seeds the same per-band state the legend chips drive, so a switched-off status stays
  listed and struck through rather than vanishing: a missing chip reads as "this project
  has no done column", not as "that band is off". A status that appears only in history (a
  renamed workflow stage) is kept in that view — dropping it would silently delete real
  work — and is drawn as a 45° hatch in neutral ink, because its only available fallback
  colour collides with whatever the registry calls `neutral`. Gridlines round the *step*
  rather than the ceiling, so an axis reads 0/300/600/900/1200 instead of 0/375/750/1125.
- **Flow tab** (after Trends) — the derivative of the cumulative flow, as a diverging
  column chart: Opened above the zero line, Completed and Dropped stacked below it, and a
  net-change line over the top. Bucket by day, ISO week or calendar month (UTC). Completed
  and Dropped stay separate because a rejected or deferred issue left the backlog without
  being delivered, and counting it as "solved" would flatter throughput. Everything is
  counted net — a reopen is a negative completion in its period — which makes three
  identities hold exactly against the live backlog (opened − left == tracked, completed ==
  done, dropped == terminal-not-done); all three are asserted in the suite. The palette is
  settled by pairlist rather than by forcing a hue: no triple of theme tokens clears the
  gates alongside green, so Opened↔Dropped is carried by direction (above/below the axis)
  plus ▲/▼ glyphs in the legend, while the two pairs that actually touch both pass.
- **`REPORTS_INCLUDED`** — pick which tabs to build, space- or comma-separated and
  case-insensitive (`"Themes Epics Issues"`); unset builds all six. Excluded tabs are
  hidden and the first survivor becomes the landing page. Dropping both Trends and Flow
  skips the `fp log` call entirely, which is the actual saving — page weight is dominated
  by the issue JSON every tab shares, so this is a "which views do I want" switch rather
  than a size optimisation.
- **`stack` in the status registry** — bottom-to-top band order for the Trends chart. This
  is a colour decision, not a cosmetic one: the natural cumulative-flow order puts
  `in-progress` (ochre) directly above `rejected` (orange) in the shipped palette, at
  OKLab ΔE 1.4 under deuteranopia and 9.0 even for normal vision — two touching bands
  nobody can separate. Swapping `in-progress` and `selected` clears every adjacent pair to
  ΔE ≥ 12.9 in both light and dark, which is what the default registry now ships. A
  registry without the field falls back to the canonical order, which is correct in shape
  but unvalidated for that project's palette.
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
