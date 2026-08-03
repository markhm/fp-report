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
  styles/*.css              base · tiles · components · mobile
  app/*.js                  model · kpis · epics · orphans · table · themes · deps · ui
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
invariants, epic/leaf separation, and epic-scoped priority — and the orphan rule,
including every near-miss it must *not* flag.

**Adding a test.** `run.sh` is a flat script of one-line assertions; `t "<description>"
<command…>` passes if the command exits 0. Four helpers do the heavy lifting:

| helper | use it for |
|---|---|
| `render <out> <issues> [conf]` | run the engine offline; `mkconf` writes a throwaway config |
| `python3 test/assert_model.py <html> <metric> <n>` | issue/open/blocked counts parsed out of the embedded JSON |
| `th <html> <check> [args…]` | the Themes model — see `test/assert_themes.js` for the checks |
| `orph <html> <check> [args…]` | the orphan rule — see `test/assert_orphans.js` for the checks |

The `assert_*.js` helpers share `test/dom-stub.js`, which evaluates the report's **real**
injected script against a minimal DOM stub — so assertions exercise the shipped code
rather than a reimplementation of its rules, and a rule cannot pass its test and still be
wrong in the browser. It also hands back the elements the script rendered into, so a check
can assert on the produced markup. Fixtures stay deliberately tiny (7 issues + a 9-issue
orphan fixture, a 3-theme taxonomy) so every expected number is checkable by hand.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for notable changes to the engine, template, and tooling.

## License

MIT — see [LICENSE](LICENSE).
