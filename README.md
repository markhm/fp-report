# fp-report

A single-file generator for a self-contained HTML **roadmap / prioritisation report**
built from live [fp](https://fiberplane.com) issue state. One shared engine + template,
many projects. Read-only — it never mutates fp.

The report is a fully offline, theme-aware HTML file: KPI signals, open-backlog
composition, an expandable **Epics** tab, a filterable/sortable **Issues** tab, and
dependency signals. No external requests — safe to open anywhere or share.

## Install

```sh
git clone https://github.com/markhm/fp-report.git
cd fp-report
./install.sh            # symlinks ~/bin/fp-report -> ./_fp-report.sh
```

`~/bin` needs to be on your `$PATH`. Requires `fp` and `python3`.

## Use

```sh
cd ~/git/some-fp-project
fp-report --init            # scaffold this project (or: --init --theme graphite)
fp-report                   # generate the report and open it
fp-report --no-open         # generate only
```

`--init` writes `scripts/fp-report.conf` + `scripts/fp-report.status.json` + a theme
into the project (prefix auto-detected from `.fp`), and a `scripts/fp-report` symlink.
Edit the conf, then run `fp-report` from anywhere in the repo.

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
| `THEME_FILE` | colour theme (see below) |
| `LOGO_LIGHT` / `LOGO_DARK` | brand wordmarks (light / dark theme); omit → neutral default |
| `OUTPUT_DIR` / `OUTPUT_FILE` | where the HTML lands (default `../reports/fp-report.html`) |

Relative paths resolve against the conf's own directory. **Config discovery order:**
`-c/--config` → `$FP_REPORT_CONF` → next to an invoking `scripts/fp-report` symlink →
`./scripts/fp-report.conf` walking up from `$PWD` → this repo's `defaults/`.

### Status registry (`fp-report.status.json`)

Mirror the project's `.fp/extensions/workflow.ts`. Each status has a `role`:
`open` (active work), `done` (terminal complete), `rejected` (terminal won't-do) —
a dependency is satisfied once `done` or `rejected`; any other role (e.g. `deferred`)
is neither. `color` is a semantic name
(`neutral`/`grey`/`blue`/`indigo`/`purple`/`teal`/`mint`/`green`/`amber`/`orange`/`red`)
or a raw `#hex` / `var(--x)`.

### Themes (`fp-report.theme.css`)

A raw CSS file of custom properties for `:root` (light) and dark. Two ship in
`defaults/`:

- **`fp-report.theme.css`** — navy / gold.
- **`fp-report.theme.graphite.css`** — brand-neutral warm-neutral light / true-dark.

Copy one and edit the hex values to rebrand — its header lists the required token
contract. The JS status colour map references the tokens by name, so keep the names.

## Packaging / offline

`./export.sh` bundles the engine, template, and `defaults/` into a self-contained
`dist/fp-report.zip` for sharing where `git clone` isn't handy.

## Development

`bash test/smoke.sh` renders the fixture (`--issues-file`, no fp needed) and asserts
the output is well-formed; CI runs it on every push (`.github/workflows/smoke.yml`).

## License

MIT — see [LICENSE](LICENSE).
