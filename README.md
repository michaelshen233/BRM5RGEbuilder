# BRM5 RGE Studio

[简体中文说明](README.zh-CN.md). The interface now defaults to Simplified Chinese. Use the language selector to switch to English; the choice is remembered. Switching languages preserves the current draft and saved workspace. Command tokens and existing user content are never translated.

A Python / Flask project with a visual web editor for BRM5 Realtime Game Editor commands. Built from the structure of the supplied `BRM5RGE.xlsx` and the owner's clarification of field meanings.

## Run locally

Install Python 3.12 or newer, then open a terminal in this project folder:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>. On macOS/Linux, use `python3 -m venv .venv` and `source .venv/bin/activate` instead. There is no frontend build step or Node dependency.

## Use the editor

1. Start with the editable elevator example or create a new project.
2. Choose a command type and fill in its fields. World accepts any positive integer, including `1231`. Object targets accept UIDs and aliases such as `%hiddenelevator`.
3. Use **Paste position & rotation** for comma- or space-separated coordinates. Three values fill X/Y/Z; six also fill the three rotations.
4. Save the command, or use **Save as copy**. Saved commands appear in the ordered project sequence.
5. Use arrows to reorder commands, duplicate them, or open their history. Each command keeps its last 30 saved revisions.
6. Copy an individual command, copy the full sequence, or export plain text for the in-game editor.

Changes to the current draft are saved locally as you type. **Save command** commits that draft to the sequence. Copy/export of a sequence includes committed commands, not unsaved draft changes.

### Bring in the supplied sheet

Use **Import workbook / backup** and choose `BRM5RGE.xlsx`. This creates a separate project with **198 entries**, preserving source-cell references, cached formula text results, object aliases, and precision. **194 entries** fit supported layouts; **4 entries** are preserved in Custom command mode for review:

- B26: explosion with two extra numeric arguments.
- Q57: incomplete `explosion` formula output.
- L88: an asset-command fragment without coordinates.
- Q196: `move1231`, with no space between command and world.

The workbook's original text is retained as provenance; supported command output normalizes whitespace only. The app never executes Excel formulas or instructions in a workbook. Cached Excel formula results may be stale: recalculate and save the workbook in a spreadsheet app before importing if you recently changed it. Missing cached results are reported in the import message.

The included `examples/workbook-library.json` is a pre-extracted backup of this same source for convenience. It is excluded from Git by default and from Vercel deployments, so your workbook data is not published with the app. The `.xlsx` itself is not bundled. Import either the source workbook or the JSON, not both unless you want two copies.

## Field meanings

Supported forms: move, tween, spawn, create, explosion, teleport player, bot spawn, trigger add, trigger addbutton, trigger set, trigger delete, trigger whitelist, and wait. Other commands remain editable verbatim as custom text.

- **World:** positive whole number, confirmed by the owner.
- **Explosion:** `explosion POWER RADIUS X Y Z TYPE`, using the owner's explicitly confirmed convention. A community guide describes these first two fields differently (radius/damage). This app intentionally uses the owner's labels and does not rearrange the workbook's tokens. Verify actual in-game effects when using a different RGE version.
- **Explosion types:** the suggestions are the four observed workbook names: `Motar`, `C4`, `Flash`, `HelicopterVehicle`. Free entry supports other types; the list is not claimed to be exhaustive.
- **Bot's last number:** orientation in degrees, supported by the [BHRM Studio author's parser and orientation visualization](https://github.com/SeanMXD/BHRM-Studio/blob/main/bhrm_studio.py). This is community implementation evidence, not official game documentation.
- **Teleport's final number:** rotation, corroborated by the [RGE guide's command listing](https://github.com/dox121-pixel/RGEAI/blob/main/Blackhawk%20Rescue%20Mission%20RGE%20Guide.md). It remains optional to preserve the shorter forms in the workbook; omitted rotation behavior was not tested in Roblox.

Precise numbers are kept as strings, including `-0`. The Python validator uses Decimal only to validate, not to rewrite values. The map uses floating point for a schematic display only and never changes command coordinates. The map fits all positions to one X/Z view, even across different worlds; it does not display game terrain or simulate motion.

## Persistence and privacy

Projects, drafts and revision history live in `localStorage` in the current browser and origin. They survive reloads but do not sync between computers. A different Vercel URL is a different storage origin. Clearing site data removes your workspace. Use **Export backup** to keep an independent JSON copy, then import it on the new address. JSON imports add projects without deleting existing projects.

The Python API performs validation and workbook extraction. It processes uploads in memory without saving them to server disk. Command data is sent to the server for validation. No database, account, analytics, or Roblox credentials are required. Exported JSON contains your command data and notes. Keep it private when appropriate.

This is a command authoring and manual recording tool. It does not read gameplay, connect to Roblox, execute game commands, or perform automatic gameplay recording. In-game syntax and behavior have not been tested inside Roblox.

## Deploy to Vercel later

The project follows [Vercel's Flask deployment documentation](https://vercel.com/docs/frameworks/backend/flask), checked September 18, 2026. `app.py` exports `app`, and assets are in `public/assets` so Vercel can serve them directly. The same assets are served by Flask locally.

1. Put the contents of this folder in a Git repository.
2. In Vercel, import that repository. Set the root directory to the folder containing `app.py` if it is nested.
3. Use the **Flask** framework preset. Leave custom build command and output directory unset. Dependencies are in `requirements.txt` and `pyproject.toml`.
4. Deploy. Open the new URL and import your JSON backup or workbook.

Alternatively, from this directory with the Vercel CLI installed:

```text
vercel
```

No secrets or environment variables are required for this version. `.vercelignore` excludes private examples, tests and docs. There is no server-side SQLite database to lose on a serverless restart. Cloud syncing would require an external database and authentication; that is not included in this version.

This deliverable has not been deployed to Vercel. The Flask API and browser flows were checked locally; deployment still needs a run in your Vercel account.

## Project structure

```text
app.py                   Flask pages, API routes, request limits and headers
rge/commands.py          Command schemas, parser and precise generator
rge/workbook.py          Safe in-memory .xlsx extraction
templates/index.html     Editor interface
public/assets/           Browser logic, styles and icon
tests/                   Parser/API regression tests
examples/                Private extracted workbook backup
vercel.json              Vercel configuration
pyproject.toml           Python metadata and Vercel entrypoint
requirements.txt         Pinned direct dependencies
```

Add a command by adding a schema to `rge/commands.py`. The form and field guide are generated from that schema. Commands are treated as text, never Python or shell code.

## Tests

```text
python -m unittest discover -s tests -v
```

To include the original workbook integration check on Windows:

```powershell
$env:RGE_TEST_WORKBOOK = 'C:\path\to\BRM5RGE.xlsx'
python -m unittest discover -s tests -v
```

The tests cover numeric precision, aliases, world validation, optional rotation, explosion ordering, malformed/custom text, request limits, and workbook round trips. No tests require Roblox or an external service.

### Editor conveniences

New workspaces start with one empty default project. Existing projects are preserved. Each project has an autosaved scratchpad, included in JSON backups but excluded from command exports. Paste command text in the visible import bar and press Enter to import; Shift+Enter adds a line. Explosion power/damage and radius support both typed values and sliders (typed values can exceed the initial slider range). Edit the live command text to synchronize supported commands back to the form and position chart; save to update the sequence. The chart includes a schematic explosion radius.

### Scaled map
The coordinate grid uses equal X/Z scale and an adjustable fixed spacing. Radius changes do not auto-fit the viewport. The supplied Ronograd image has an approximate placement derived from the screenshots: E 450–4830 m, N 100–4600 m. These are reference estimates, not verified game bounds. Large map squares use approximately 1 km (the supplied 3,280 ft annotation), with 10 subdivisions. Terrain projection requires RGE units per square, origin X/Z, and Z direction. X is assumed eastward; radius uses the same units as coordinates and remains the second argument per the user convention. Validate against landmarks before relying on terrain placement. This is horizontal radius geometry, not a damage/occlusion simulation. Calibration is project-specific and included in JSON backups. Run `node tests/map-check.cjs` for map geometry checks.

The two user-provided teleport references now define the default approximate similarity transform: airport X=-3472.39990234375 Z=1152.5999755859375 and southern city X=3460.60009765625 Z=1147.199951171875. Both use approximate image area centres; positive Z south is assumed. Default scale is about 3,277 RGE units/km. Manual alignment overrides this estimate. This is not a verified georeference.

Reference markers and the reference-command panel are hidden from the editor. The underlying approximate map calibration is retained.
