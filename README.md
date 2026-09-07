# DaySchedule

DaySchedule is a browser-based day-schedule builder. It runs entirely in your browser — no server, no accounts, and no network access. Your schedule data never leaves your computer.

Licensed under the MIT License. See [LICENSE](LICENSE).

## How Your Data Is Stored

Everything lives in one **`.schedule` file** (a workbook) that you save on your own computer or a shared drive. One workbook file can hold many schedules — use the schedule switcher in the toolbar to move between them.

- **Chrome and Edge:** after you save once, DaySchedule auto-saves every edit back to your `.schedule` file (watch for `Saved` in the toolbar). The start screen offers a **Continue** card to reopen your last workbook.
- **Safari and Firefox:** auto-save to a file isn't supported by the browser. Each save downloads a fresh copy of the `.schedule` file and the toolbar shows `Downloaded` (not `Saved`) — keep the newest copy; the file you opened is unchanged.

A session backup underneath every edit protects against crashes and accidental tab closes, and the app warns you before closing with unsaved work.

## First-Time Use

1. Open `index.html` (or the single-file `DaySchedule.html`) in Chrome or Edge.
2. Click **Create** to start a new schedule, or **Open .schedule** to open an existing workbook file.
3. Build your day: `+ Day`, `+ Event`, `+ Note`. `Quick Edit` works like a dense worksheet — one row per event, with a selected-row editor for extra fields.
4. Save when prompted. After the first save, edits auto-save; wait for `Saved` in the toolbar before closing or handing off.

`Audience` means the group or section an event belongs to. `Primary` audiences go to the main track automatically. `Supporting` or unassigned events stay out of the main track unless you turn on `Main Track`. `Specific People` is for named people who need something different from the main audience.

## Working as a Team

DaySchedule has no server, so there is no real-time collaboration. The safe workflow for a shared `.schedule` file (SharePoint, Teams-synced folder, network drive):

- **One editor at a time.** Agree on who has the file, edit, wait for `Saved`, hand off.
- Before major changes, open **Versions** (under `More`) and save a named version — restoring creates an automatic backup of the current state first.
- If two people edit the same file at once, the last save wins and the other person's changes are lost. Nothing in the app can prevent that — the rule has to be human.
- If you reach the file through Teams/SharePoint, use the **synced** folder on your computer. A downloaded copy is a separate file that nobody else sees.

### Legacy shared-folder mode

Earlier DaySchedule versions supported a shared `app/data` folder with per-schedule files, edit locks, and Take Over. That mode still works in browsers that already have the folder connected, but new setups can no longer connect to it — the workbook flow above replaced it. The locks it used are advisory (they rely on folder sync being fast), so the one-editor-at-a-time rule applies there too.

## Layouts

Four layouts render the same data: **Bands** (main track + concurrent events), **Grid** (time × groups), **Cards** (per-group panels), and **Phases** (long block exercises). Layout applies to the whole schedule. On crowded days, Bands shows a density note with one-click switches — Grid or Cards are usually easier to check for conflicts.

Overlapping events are **allowed by design** (concurrent training is the normal case). Bands surfaces them as "Also Happening" and exception notes; Grid warns when events in the same group's lane overlap. Cards and Phases simply show all events.

## Printing

Use the in-app **Print** button or `Ctrl/Cmd+P`. Every day prints on its own page, auto-scaled to fit. Very dense days print smaller to fit the paper — if a page is hard to read, switch layouts or split the day.

## If Something Breaks

Open **Help → Shortcuts**. The bottom shows the build stamp and a local log of recent errors — include both in any bug report. The log stays on your computer.

The most common cause of "buttons don't work" is a stale copy of the app. Compare the build stamp with the current release before anything else.

## Known Limitations

- **Single-day events only.** An event cannot cross midnight (e.g., 2200–0100). The editor rejects such ranges, and files containing them load with a notice that those events were skipped.
- **Not a calendar.** There are no time zones, no recurrence, no reminders. Times are plain 24-hour wall-clock labels (`0730`), and every day is built explicitly.
- **No multi-editor protection in the workbook flow.** A shared `.schedule` file is last-writer-wins. One editor at a time; save Versions before big changes.
- **Schedules inside a workbook can't be deleted yet.** The workbook switcher can create, duplicate, and open schedules but not remove one. To drop an unwanted schedule, use **Start fresh** for a new workbook or leave it in place.
- **Logos must be image files under 2 MB.** The logo is stored inside the `.schedule` file itself (and in the crash-recovery backup), so larger files are refused with a message.
- **Legacy-mode locks are advisory.** Two people clicking `Edit` within a slow folder-sync window can both succeed. `Take Over` reloads the file from disk, but work the other editor hadn't saved is lost.
- **Full auto-save needs Chrome or Edge.** Safari and Firefox fall back to download-based saving.
- **Versions live inside the workbook file.** Versions created before the first save of a new draft exist only in the session backup until the file is saved.
- **Crash recovery has a size limit.** Very large logos can exceed browser session-storage quota; if that happens the crash backup stops updating (a warning is logged to the browser console).
- **Dense-day printing trades size for fit.** Print always fits the paper, even if that means small text. On screen the page grows taller instead.
- **No enforcement, by design.** There are no accounts and no server: anyone who can open the file can edit it. The app is zero-egress — a strict Content-Security-Policy blocks all network traffic, which is also why it works fully offline.

## Building the Single-File App Shell

```bash
python3 tools/build-single-html.py
```

This creates `dist/DaySchedule.html` — the whole app in one file, stamped with the build date (shown in Help). The generated file is only the app shell; schedule data stays in your `.schedule` files. The build fails loudly if the zero-egress CSP tag is missing.

## Tests

Open these in a browser (serve the repo root, e.g. `python3 -m http.server`):

- `support/tests/runner.html` — unit tests (utilities, schema validation, data helpers, store)
- `support/tests/runner-integration.html` — storage/persistence integration tests (in-memory FSAPI mock)
- `support/tests/runner-ui.html` — UI harness (renderers, app-shell flows, print behavior)

Note: `python3 -m http.server` sends no cache headers, so browsers cache the app JS aggressively. After editing, serve on a fresh port or hard-reload — otherwise you are testing stale code.
