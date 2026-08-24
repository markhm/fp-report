# fp-report

A single-file generator for a self-contained HTML **roadmap / prioritisation report**
built from live [fp](https://fiberplane.com) issue state. One shared engine + template,
many projects. Read-only — it never mutates fp.

The report is a fully offline, theme-aware HTML file: a **global search** (id / title /
spec) at the top, KPI signals, open-backlog composition, a tiled **Themes** tab, an
expandable **Epics** tab, a filterable/sortable **Issues** tab, an **Orphans** tab for
work left behind in closed epics, and dependency signals.
It is **responsive** — the same single file lays out as cards on an iPhone-class screen —
and lets you tap/right-click an issue id to copy it. No external requests — safe to open
anywhere or share.

The **Themes** tab is built from the project's own fp `labels` and `workflow` extensions.
fp's defaults are too thin to tile well, so a more elaborate taxonomy is what buys a good
result — see [the Themes page is only as good as your fp
extensions](#the-themes-page-is-only-as-good-as-your-fp-extensions).

## Install

```sh
git clone https://github.com/markhm/fp-report.git
cd fp-report
tools/install.sh        # symlinks ~/bin/fp-report -> ./fp-report.sh
```

`~/bin` needs to be on your `$PATH`. Requires `fp` and `python3`.

## Use

```sh
cd ~/git/some-fp-project
fp-report --init            # scaffold this project (or: --init --theme graphite)
fp-report                   # generate the report and open it
fp-report --no-open         # generate only
fp-report --help            # every flag, straight from the script
```

Working on the tool itself? `bash test/run.sh` runs the whole suite offline in a couple
of seconds — see [Development](#development).

`--init` writes `scripts/fp-report.conf`, `scripts/fp-report.status.json`,
`scripts/fp-report.themes.json` and a theme into the project (prefix auto-detected from
`.fp`), plus a `scripts/fp-report` symlink. Edit the conf, then run `fp-report` from
anywhere in the repo.

## Per-project config

Everything a project needs lives in its own `scripts/` (the engine + template stay
shared here). `fp-report.conf` — sourced as bash — sets:

| key | meaning |
|-----|---------|
| `FP_PREFIX` | issue short-id prefix (matches `.fp/config.toml`); renders `PREFIX-<shortId>` |
| `PROJECT_NAME` | logo alt text |
| `APP_NAME` | application name in the browser `<title>` + header kicker |
| `REPORT_TITLE` | on-page heading |
| `STATUS_FILE` | status registry (see below) |
| `THEMES_FILE` | theme taxonomy for the Themes tab (see below) |
| `FETCH_LABELS` | fetch each issue's labels (default `true`; see below) |
| `LABEL_CACHE` / `LABEL_JOBS` | label cache path / parallel fetches (defaults are fine) |
| `FETCH_HISTORY` | replay `fp log` for the Trends/Flow tabs (default `true`; see below) |
| `HISTORY_LIMIT` | `fp log --limit` (default `200000` — i.e. "everything") |
| `REPORTS_INCLUDED` | which tabs to build (default: all; see below) |
| `THEME_FILE` | colour theme (see below) |
| `LOGO_LIGHT` / `LOGO_DARK` | brand wordmarks (light / dark theme); omit → neutral default |
| `OUTPUT_DIR` / `OUTPUT_FILE` | where the HTML lands (default `../reports/fp-report.html`) |

Relative paths resolve against the conf's own directory. **Config discovery order:**
`-c/--config` → `$FP_REPORT_CONF` → next to an invoking `scripts/fp-report` symlink →
`./scripts/fp-report.conf` walking up from `$PWD` → this repo's `defaults/`.

> **Looking for `.env.example`?** There isn't one, and there is nothing secret to put in
> it. [`defaults/fp-report.conf`](defaults/fp-report.conf) is this tool's annotated
> reference configuration — every supported key, commented, with its default. `fp-report
> --init` copies a trimmed version into your project; open the reference file for the
> keys it leaves out (deployment, `ASSETS_DIR`, label-cache tuning). The only environment
> variable the tool reads is `$FP_REPORT_CONF`, which just points at a config file.

### Status registry (`fp-report.status.json`)

Mirror the project's `.fp/extensions/workflow.ts` — order here is display + sort order.
Each status has a `role`: `open` (active work), `done` (terminal complete), `rejected`
(terminal won't-do) — a dependency is satisfied once `done` or `rejected`; any other
role (e.g. `deferred`) is neither. `color` is a semantic name
(`neutral`/`grey`/`blue`/`indigo`/`purple`/`teal`/`mint`/`green`/`amber`/`orange`/`red`)
or a raw `#hex` / `var(--x)`.

This registry does more than colour badges: the **Themes** tiles draw one chip per
`open` status, so how finely you split "open" in `workflow.ts` decides how much a tile
can tell you. See [the Themes page is only as good as your fp
extensions](#the-themes-page-is-only-as-good-as-your-fp-extensions).

### Theme taxonomy (`fp-report.themes.json`)

Drives the **Themes** tab: a grid of tiles, one per theme. Each tile carries a
**priority distribution** — one row for critical / high / medium / low / unset — and each
row is a bar **segmented by status** (one segment per open status, plus done), so you read
both dimensions at once: how much work sits at each priority, and how far along it is.
Every bar is scaled against the largest row **across the whole grid**, so length is
comparable between tiles — a full bar means the same count wherever you see it. Hovering
a row gives the exact per-status breakdown.

**hide done** in the tab bar is **on by default**: tiles open showing only backlog and
in-progress work. On a backlog that is three-quarters complete, done otherwise fills every
bar and all themes collapse to the same shape — and a theme whose only "critical" work
shipped months ago would open looking like it still has critical work. Untick it to see
the full history; the headline, legend, footer and bar scale all follow the toggle. Tiles are grouped by *facet* (shipped defaults: **Quality** (ISO/IEC
25010), **Area**, **Work type**) and clicking one jumps to the Issues tab filtered to
that theme. Mirror the project's `.fp/extensions/labels` vocabulary here so themes
converge on the labels you actually use.

Tiles count **leaf work items**. An epic's status is a roll-up of its children, so
counting an in-progress epic *and* the sub-issue driving it double-counts the same work;
epics get their own `N epics (M open)` figure instead.

Priority needs the same care: inside an epic, "critical" ranks a sub-issue against its
siblings — sequencing, not urgency — so it is not comparable with a top-level critical.
The rows show the full distribution, and each row's tooltip splits it into *top-level*
versus *scoped to an epic* so a headline number can't be read off epic-internal ranking.

Every issue lands in **exactly one theme per facet**, so tiles always partition the
backlog. The theme is resolved in descending order of trust:

1. **label** — an fp label whose value matches a theme `key` (ties broken by taxonomy order)
2. **inherited** — a sub-issue follows its epic's theme. This deliberately outranks its
   own keywords: an initiative that fragments across five tiles because each sub-issue
   matched a different word is exactly what stops the page helping you focus.
3. **inferred** — weighted keyword match: `strong`/`weak` regex fragments scored
   6/3 in the title and 2/1 in the description, best theme wins if it clears `threshold`
   (settable per facet). This classifies epics and standalone issues.
4. **unthemed** — no signal; its own tile, and the cue to start labelling

The page footnotes how many issues came from each source. **Labels always win**, so
labelling an issue is how you correct a tile.

#### The Themes page is only as good as your fp extensions

Tiles are built from two things fp holds per project, and **fp's out-of-the-box defaults
are not enough to tile well**:

| what the tiles need | where it comes from | fp's default |
|---|---|---|
| which theme an issue belongs to | `.fp/extensions/labels` | **no label vocabulary at all** |
| the per-status chips, and what counts as open / done | `.fp/extensions/workflow.ts` | 6 statuses, only 3 of them `open` |

With a stock fp project you get a Themes page where **every** tile is keyword-inferred
or unthemed, and the chips collapse to a single "Backlog" bar. It renders, but it can't
tell you much. Getting a good result means elaborating both extensions and then mirroring
them into this tool's two config files:

```
.fp/extensions/labels/index.ts  ──mirror──▶  fp-report.themes.json   (theme keys, facets, colours)
.fp/extensions/workflow.ts      ──mirror──▶  fp-report.status.json   (labels, colours, roles)
```

**Labels — build a faceted, enforced vocabulary.** A flat bag of free-text labels tiles
badly: synonyms split one theme across two tiles, and typos create tiles of one. What
works is a small controlled vocabulary in **orthogonal facets**, so an issue can carry
one label from each and the report can offer each facet as a separate grouping. The
worked example this tool's defaults are modelled on uses three:

- **Area** — *where* in the system (component). `mc-portal`, `backend`, `infra`, …
- **Work type** — *what kind* of work. `bug`, `change`, `tech-debt`.
- **Quality** — *which quality attribute*, named per **ISO/IEC 25010** rather than
  ad-hoc synonyms, so "resiliency" and "reliability" can't become two tiles.

Enforce it in an `issue:creating` / `issue:updating` hook that rejects anything outside
the allow-list — a taxonomy that can rot via free-form strings will rot, and every
misspelling becomes a bogus tile. Each theme `key` in `fp-report.themes.json` must equal
the label value for that label to win over keyword inference.

**Workflow — more open statuses means a more useful tile.** The chips on a tile are one
per `open` status, in registry order. With a single open status every tile shows one
number and you cannot see whether a theme is stalled in backlog or actually moving.
Distinguishing at least *backlog → selected → in progress* is what makes the chips
worth reading, and `deferred` / `rejected` keep parked work out of the open counts
without deleting it. Give each status a `role` (`open` / `done` / `rejected` / anything
else) — that is what the tiles, the progress bars, and dependency satisfaction all key off.

**Keep the mirrors in sync.** These two JSON files are hand-maintained copies of the
extensions, so they drift silently — e.g. a status whose colour is `purple` in
`workflow.ts` but `indigo` in `fp-report.status.json` renders a chip that doesn't match
fp's own UI. Re-check them whenever you edit an extension.

**Coverage is the lever.** Once the vocabulary is right, the tiles improve in proportion
to how many issues actually carry labels — nothing else moves the needle as much. At
~14% label coverage on a ~950-issue backlog, roughly a fifth of the theming came from
real labels and the rest from keywords and epic inheritance. The **Unthemed** tile and
the per-tile `N labelled` figure are there to show you exactly where that gap is; label
the epics first, since sub-issues inherit from them.

### Labels (`FETCH_LABELS`)

`fp issue list` omits `properties`, so labels are only available via one
`fp issue show` call per issue. The engine fetches them in parallel and caches the
result by `updatedAt` next to the report, re-fetching only issues that changed — a
cold run on a ~1000-issue backlog takes about a minute, later runs under a second.

```sh
fp-report --no-labels        # skip it entirely (themes then come from keywords only)
fp-report --refresh-labels   # ignore the cache and re-fetch everything
```

The cache (`.fp-report.labels.json`) is a derived file — don't commit it.

### Colour themes (`fp-report.theme.css`)

A raw CSS file of custom properties for `:root` (light) and dark. Two ship in
`defaults/`:

- **`fp-report.theme.css`** — navy / gold.
- **`fp-report.theme.graphite.css`** — brand-neutral warm-neutral light / true-dark.

Copy one and edit the hex values to rebrand — its header lists the required token
contract. The JS status colour map references the tokens by name, so keep the names.

## Epics — sorting the roadmap

The **Epics** tab lists every epic with open children, plus still-open issues titled
"Epic" that have not been broken down yet. It opens on **Urgency** — priority, then how
much work is still open — which answers *what is most pressing*. Three more sort keys
answer the questions that actually drive an epic to done:

- **Created** — oldest first. The epics quietly ageing out of relevance.
- **Last activity** — most idle first. The epics nobody has touched.
- **Progress** — least complete first. The epics still near the starting line.

Click a key to sort by it; click the *active* key to flip the direction. Every key falls
back to the urgency comparator, so epics that tie on the key still land in the pressing
order. The two metrics being sorted on are printed on each row (`54d old · idle 54d`), so
an unfamiliar ordering explains itself, and an epic idle more than 14 days is flagged
`stale` exactly as on the Issues tab.

**"Last activity" is rolled up over the epic and its direct children.** An epic issue's
own `updatedAt` only moves when the epic *record* is edited — its title, priority or
description — so on its own it says nothing about whether the work is moving: an epic
whose children all changed yesterday can still read as months idle. Taking the maximum
across the epic and its children reports what the tab is actually asked about. On a real
40-epic backlog the two differ for about half of them. Direct children only — the same
one level the tab's `done / open / other` counts are taken over. A childless "Epic"-titled
issue has nothing to roll up, so it falls back to its own `updatedAt`, which for it *is*
the signal.

## Orphans — work left behind in a closed epic

The **Orphans** tab needs no configuration; it is derived from the status registry's
`role` field. An issue is an orphan when **its parent is terminal and it is not**:
someone closed the epic without finishing, re-homing, or closing what was still inside
it. Nothing else in the report shows this work — the Epics tab lists only epics with
open children, and on the Issues tab these rows are hidden by the default `no parent`
filter — so it stays invisible until you go looking for it.

Rows are grouped by the epic that closed, because that is how you fix it: for each
group, move the list under a live epic, make it standalone, or close it.

Two edges are worth stating, since the tab decides them for you:

- **Terminal means `done` *or* `rejected`.** A rejected epic strands its children just
  as thoroughly as a done one. On the child side, "not terminal" is wider than "open" —
  a `deferred` sub-issue under a closed epic will never be picked up either, so it counts.
- **Only the direct parent is tested.** A still-open sub-epic under a closed epic *is*
  the orphan; re-homing it moves everything beneath it, so its own children are not
  listed again.

`Orphaned — under a closed epic` also appears as a KPI signal at the top of the page.

## Trends — a cumulative flow diagram, replayed from the activity log

The **Trends** tab is a stacked area chart of how many issues sat in each status on every
past day. Band *thickness* is the queue at that stage: a widening band is work piling up,
the top edge is total scope, and the base is delivery.

### It is a replay, not an interpolation

The issue list is a **snapshot** — it knows what is in progress now and nothing about what
was in progress in May. Charting trends from it alone forces the usual fudge: assume every
issue held its current status since `createdAt`, which draws a flat line for exactly the
period you wanted to look at, and back-dates today's 790 "done" to the start of the project.

So this tab is built from `fp log` instead, which records every `status: A → B`,
`issue_created` and `issue_deleted` the project has ever seen. Replaying those gives the
real count per status per day. Concretely, on maintainability-cloud that is 2,526 events
across 157 days — and the replay's final day matches the live backlog **exactly**, status
for status, which is the property that makes the chart trustworthy: it cannot drift from
the "By status" bars at the top of the same page.

Reconstruction rules, in order of trust:

| | rule |
|---|---|
| **born** | its `issue_created` event, else `createdAt` from the issue list |
| **initial status** | the `from` of its **first transition** — the log records what it left, so this is exact. Never moved → its current status |
| **final status** | for a live issue, the **live** status. This deliberately outranks the last transition's `to`, so a missing log row can't leave the chart disagreeing with the dashboard |
| **end** | its `issue_deleted` event, else open-ended |

Deleted issues are counted for the span they existed, then drop out. Issues that predate
the log enter at their `createdAt` in their current status — their early history is flat
rather than replayed. **The chart states all of this itself**: the line under it reports
the event count and every caveat that applies to your data, so you always know how much of
what you are looking at is replayed and how much is assumed.

### Tuning it

- **`hide done`** (the tab-bar checkbox, ticked by default) switches off every terminal
  status, exactly as it does on the Themes tiles and for the same reason: on a backlog
  that is three-quarters complete the done band is most of the height and the live queue
  underneath it collapses into unreadable hairlines. It *seeds the same per-band state the
  chips drive*, so those statuses stay listed in the legend, struck through — a chip that
  disappeared would be indistinguishable from "this project has no done column". Untick
  it, or click the chip, to bring the completion base back.
- **Status bands** — click any legend chip to drop or restore its band. De-selected chips
  hollow the swatch and strike the label, so "off" never depends on colour alone.
- **Retired statuses** — a status that appears only in history (a stage the workflow has
  since renamed) has no role to test, so it is kept rather than dropped: deleting real
  work from the chart is the worse failure. It has no registry colour either, and the
  obvious fallback collides with whatever the registry calls `neutral`, so it carries the
  difference on the **texture** channel instead — same neutral ink, 45° hatch, labelled
  `· retired`. That survives greyscale and colour-vision deficiency, and cannot collide
  with a hue in a palette this tool has never seen.
- **Themes** — the same facets as the Themes tab. Picking one narrows the population the
  chart counts; `All` resets. (Deleted issues leave the chart while a theme filter is on:
  there is no row left to classify them with, and the note says so.)
- **Range** — 30d / 90d / All.
- **Table view** — the same numbers as text. Not optional decoration: two of the default
  status hues sit under 3:1 contrast against the light surface, so every value the chart
  paints has to be readable without relying on the colour.

Hovering snaps a crosshair to the nearest day and lists every visible status at once; the
chart is keyboard-focusable and ←/→ walk the same readout.

### Band order is a colour decision (`stack`)

Bands stack bottom→top by the registry's optional `stack` field. This is not cosmetic. The
natural cumulative-flow order — terminal states at the base, then open work
most-advanced-first — puts `in-progress` (ochre) directly above `rejected` (orange) in the
shipped palette: **OKLab ΔE 1.4 under deuteranopia, and 9.0 even for normal vision.** Two
touching bands nobody can separate. Swapping just `in-progress` and `selected` clears every
adjacent pair to ΔE ≥ 12.9 in *both* light and dark, which is the order the default
registry ships.

A registry without `stack` falls back to the canonical order — correct in shape, but
unvalidated for your palette. **If you recolour your statuses, re-check the adjacent pairs**
rather than eyeballing them. Registries copied from an older `fp-report --init` predate the
field; add it to get the validated order.

Set `FETCH_HISTORY="false"` (or pass `--no-history`) to skip the `fp log` call — one extra
call per run, ~0.5s on a 1000-issue project. Without history there is nothing to replay, so
the tab removes itself and the rest of the report is unaffected.

## Flow — the derivative of the trend

Trends answers *how much sat where*. **Flow** answers *how much moved, and when*: the
same replay differentiated, as a diverging column chart.

- **Opened** rises above the zero line — issues created in that period.
- **Completed** and **Dropped** fall below it, stacked. They are counted **separately on
  purpose**: an issue that was rejected or deferred left the backlog without being
  delivered, and folding it into "solved" would flatter throughput.
- **Net change** rides over the bars as a line — opened minus closed, i.e. whether the
  backlog grew or shrank that period.

Bucket by **Day / Week / Month** (weeks are ISO, starting Monday, in UTC; months are
calendar months). Range and theme filters are shared with Trends.

### The numbers reconcile, by construction

Everything is counted **net** — a reopened issue is a negative completion in its period, and
an issue that leaves the backlog hands back whatever it was last counted as. That is what
makes these three identities hold exactly, and they are asserted in the test suite:

```
sum(opened) − sum(left the backlog)  ==  issues tracked today
sum(completed)                       ==  issues in a done status today
sum(dropped)                         ==  issues in a terminal non-done status today
```

On maintainability-cloud that is 1,139 opened − 27 left = 1,112 tracked, 792 completed, 68
dropped — every one matching the live backlog. A flow chart that doesn't add up to the
backlog it describes is decoration.

### Why the colours are what they are

Opened is indigo, Completed green, Dropped grey. **No triple of this theme's tokens clears
the colour gates alongside green** — the dark theme's greys are lavender, so every cool
"opened" collides with a grey "dropped", and every warm one collides with green under
colour-vision deficiency. Rather than force a hue, the fix is to be honest about which
pairs actually touch:

- **Completed ↔ Dropped** are stacked and adjacent → ΔE 13.9 light, 16.3 dark. Passes.
- **Opened ↔ Completed** meet across the zero line → ΔE 20.6 / 19.5. Passes.
- **Opened ↔ Dropped** are never told apart by hue at all. They sit on opposite sides of
  the axis, and the legend marks them ▲ / ▼. Direction is the encoding.

## Choosing which tabs to build (`REPORTS_INCLUDED`)

```sh
REPORTS_INCLUDED="Themes Epics Issues"        # space- or comma-separated, case-insensitive
```

Unset (the default) builds all six: `Themes Epics Issues Orphans Trends Flow`. An
unknown name is reported on stderr and ignored rather than failing the run. Excluded tabs
are hidden and the first surviving tab becomes the landing page, so the report never opens
on a blank panel.

Two things worth being straight about:

- **Excluding the two history tabs saves real weight; excluding the others saves almost
  none.** Drop *both* Trends and Flow and the engine skips the `fp log` call **and** the
  event payload it embeds — on maintainability-cloud that is 97 KB raw / 24 KB gzipped,
  about 4% of the file, plus ~0.5s of generation. Excluding Themes, Epics, Issues or
  Orphans saves only their (hidden) markup: the page's weight is the issue JSON that every
  tab shares.
- **Excluded sections are hidden, not stripped.** Their markup stays in the DOM so every
  render path can keep writing into it unconditionally. That keeps this feature from
  touching anything else, at the cost of a few hundred bytes of hidden markup.

## Deploy (publish to a static site)

**The model:** the report is one self-contained HTML file, so "publishing" is just
committing that file into a repo a static host watches. `fp-report-deploy.sh` does the
whole loop in one command:

1. locates the same `fp-report.conf` the engine uses (identical precedence),
2. regenerates the report **directly into** `DEPLOY_REPO/DEPLOY_SUBDIR/$OUTPUT_FILE`,
3. `git add -A` + commit in that repo (exits quietly if nothing changed),
4. pushes `DEPLOY_BRANCH` to `origin` — and the host redeploys on the push.

There is **no build step and no separate deploy config**: the publishing target lives in
the project's `fp-report.conf` alongside everything else:

| key | meaning |
|-----|---------|
| `DEPLOY_REPO` | local checkout of the publishing repo (absolute, or rel. to the conf) |
| `DEPLOY_SUBDIR` | served directory inside it (default `src`) — the report lands here |
| `DEPLOY_BRANCH` | branch to push (default `master`) |
| `DEPLOY_REMOTE` | origin to add/create on first run; blank → skip remote setup |

```sh
fp-report-deploy                    # generate + commit + push, using the located conf
fp-report-deploy --dry-run          # generate only; show git status, don't commit/push
fp-report-deploy -c PATH/conf       # use an explicit project config
fp-report-deploy -m "message"       # custom commit message (default: timestamped)
fp-report-deploy --help             # the same summary, from the script itself
```

**First run bootstraps the publishing repo:** `git init` on `DEPLOY_BRANCH`, adds
`DEPLOY_REMOTE` as origin, and — if the remote doesn't exist yet and `gh` is on `$PATH` —
creates it as a **private** GitHub repo before pushing. Leave `DEPLOY_REMOTE` blank to
commit locally and never push.

**Credentials: there are none to configure.** This tool stores no tokens and reads no
`.env`. The push uses whatever git credentials you already have, and `gh` is only invoked
to create the remote on that first run. So the prerequisites are simply: `git` configured
with a usable identity, push rights on the target repo, and optionally `gh` for
repo creation. Point your host (CloudFlare Pages, Netlify, GitHub Pages) at
`DEPLOY_BRANCH` / `DEPLOY_SUBDIR` once, in its own dashboard — that part is not
automated.

## Packaging / offline

`tools/export.sh` bundles the engine, the whole `template/` directory, and `defaults/`
into a self-contained `dist/fp-report.zip` for sharing where `git clone` isn't handy. The
unzipped bundle runs as-is — it assembles the template exactly like a checkout does.

## Development

### Layout

```
fp-report.sh            the engine — locates config, pulls fp state, renders
fp-report-deploy.sh     publish the rendered report to a static-site repo
template/               the report, authored as parts and assembled at render time
  fp-report.template.html   the shell: page markup + include directives
  styles/*.css              base · tiles · components · chart · mobile
  app/*.js                  model · kpis · epics · orphans · table · themes · deps · trends · flow · ui
defaults/               reference config, status registry, theme taxonomy, themes, logos
tools/                  install.sh, export.sh
test/                   run.sh + fixtures + assertion helpers
```

### The template is many files, the report is one

The output has to stay a **single self-contained HTML file** — that is the whole point:
you can email it, drop it in a bucket, or open it offline with no server. But an 880-line
monolith is miserable to work in, so the template is authored as small files and assembled
at render time.

`template/fp-report.template.html` is the page shell; wherever content belongs it carries
a directive:

```html
<!--#include styles/tiles.css -->
<!--#include app/themes.js -->
```

The engine inlines each one (relative to the template's own directory, nesting allowed,
with cycle and depth guards) before substituting `__FP_DATA__` and friends. Two rules
worth knowing:

- **A directive must sit alone on its line.** Anything else can't be substituted, so the
  engine aborts rather than shipping a page with a literal `<!--#include …-->` comment
  where content should be. A missing file aborts too — silence here would mean publishing
  a hole.
- **All of `app/` is concatenated into one `<script>`, in the listed order.** The parts
  share a top-level scope and rely on hoisting across sections, so separate `<script>`
  tags would change behaviour. Order matters: `model.js` first, then anything that
  consumes it.

Adding a section is: drop a file in `styles/` or `app/`, add one include line in the
shell. No build step, no bundler, no dependencies.

### Tests

```sh
bash test/run.sh        # the whole suite; exits non-zero if anything fails
```

**No setup, no network, no live fp.** Every case renders `test/fixture.issues.json`
through the real engine with `--issues-file` and asserts on the produced HTML. It needs
`bash` + `python3`; `node` is optional and only unlocks the JS-level checks (they skip
silently without it). CI runs the same one line on every push
(`.github/workflows/tests.yml`, Node 20).

What it covers: placeholder replacement and injection safety (a hostile issue title must
not break out of the embedded JSON), prefix/title/theme/status/taxonomy injection and
their fallbacks, the open/blocked model, `--init` scaffolding, the pure path helpers, the
Themes model — resolution order (label > inherited > keyword > unthemed), the partition
invariants, epic/leaf separation, and epic-scoped priority — the epic roadmap's four sort
keys in both directions (including that "last activity" follows a child's clock rather
than the epic record's own, and that an expanded row survives a re-sort), the orphan rule,
including every near-miss it must *not* flag, and the Trends replay: parsing `fp log` text, initial
status taken from the first transition rather than back-dating the current one, deleted
issues counted only for the span they existed, and — the one that matters most — that the
replay's final day reconciles **exactly** with the live snapshot, status for status. Flow
adds its own three reconciliation identities (opened/completed/dropped against today's
backlog), UTC bucket edges for day/ISO-week/month, and `REPORTS_INCLUDED` gating including
that excluding both history tabs really does skip the `fp log` call.

**Adding a test.** `run.sh` is a flat script of one-line assertions; `t "<description>"
<command…>` passes if the command exits 0. A few helpers do the heavy lifting:

| helper | use it for |
|---|---|
| `render <out> <issues> [conf]` | run the engine offline; `mkconf` writes a throwaway config |
| `render_h <out> <issues> <log> <conf>` | same, plus a saved `fp log` transcript to replay |
| `python3 test/assert_model.py <html> <metric> <n>` | issue/open/blocked counts parsed out of the embedded JSON |
| `th <html> <check> [args…]` | the Themes model — see `test/assert_themes.js` for the checks |
| `orph <html> <check> [args…]` | the orphan rule — see `test/assert_orphans.js` for the checks |
| `ep <html> <check> [args…]` | the epic roadmap's sort — see `test/assert_epics.js` for the checks |
| `tr <html> <check> [args…]` | the Trends replay — see `test/assert_trends.js` for the checks |
| `flow <html> <check> [args…]` | the Flow derivative — see `test/assert_flow.js` for the checks |

The `assert_*.js` helpers share `test/dom-stub.js`, which evaluates the report's **real**
injected script against a minimal DOM stub — so assertions exercise the shipped code
rather than a reimplementation of its rules, and a rule cannot pass its test and still be
wrong in the browser. It also hands back the elements the script rendered into, so a check
can assert on the produced markup. Fixtures stay deliberately tiny (7 issues + a 9-issue
orphan fixture, a 9-issue 4-epic roadmap fixture, a 19-event `fp log` transcript, a
3-theme taxonomy) so every expected
number is checkable by hand.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for notable changes to the engine, template, and tooling.

## License

MIT — see [LICENSE](LICENSE).
