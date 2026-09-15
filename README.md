# DaySchedule

DaySchedule is a browser-based day-schedule builder. It needs no account or application server. The app makes no network requests after its files load and works offline. Schedules live in files you choose and browser recovery storage. Saving to a synced or shared folder lets that folder's service copy the file elsewhere; DaySchedule does not upload it.

Licensed under the [MIT License](LICENSE). The generated app also includes the license notice.

## Start and save

1. Open `app/index.html`, or open the built `dist/DaySchedule.html` as a local file.
2. Choose **Create** for a new workbook or **Open .schedule** for an existing one.
3. Build your day with **+ Day**, **+ Event**, and **+ Note**. **Quick Edit** gives you a worksheet with one row per event.
4. Save the workbook. A `.schedule` file can hold several schedules; use the toolbar switcher to move between them.

In a standalone Chrome or Edge tab, supported file access lets the app autosave edits to the file after the first save. Wait for **Saved** before closing or handing off. The start screen can offer **Continue** to recover a draft or reopen a remembered file; the browser may ask for permission again.

Safari and Firefox use download-based saving. **Downloaded** means a fresh copy was sent to Downloads; the file you opened is unchanged. Keep the newest copy. Embedded browsers may also restrict native file access: open the standalone app in its own tab when you need file autosave.

Browser recovery storage protects work when available. It is separate from saving the workbook, and it can be unavailable, cleared, or full. Keep saved copies of important work.

The recovery copy includes the whole workbook, archived schedules, and version history. On **Continue**, a clean remembered workbook reloads the latest file. If local edits and the file have both changed, the app offers **Cancel** or **Keep Both**. Keep Both puts recovered copies alongside the latest file's schedules for you to compare. A changed file also pauses background autosave; use **Save Now** to review it.

## Manage and reuse schedules

The workbook switcher can search, open, create, and duplicate schedules. **Archive** removes a schedule from the active list while keeping it in the file; expand **Archived schedules** and choose **Restore** to bring it back. Keep at least one active schedule. Archiving does not erase sensitive information from the file.

Use **Duplicate Current** to copy a schedule. Its optional **New first date** shifts all day dates by the same offset, preserving their spacing. Review the dates before **Create Copy**. You can also clear contacts and event POCs, notes, or specific people when preparing the next exercise. The original schedule stays available.

**More → Versions** supports named snapshots, restore, rename, and delete, and shows the approximate workbook size. Versions include appearance settings and logos. Deleting unneeded versions can reduce file size; archiving a schedule retains its contents.

## Work with a team

Use **one editor at a time** for a shared workbook. Agree on who has it, wait for **Saved**, then hand off. Files reached through a Teams or SharePoint synced folder are shared through that service; a separately downloaded copy is a different file.

Before major changes, use **More → Versions** to save a named version. Versions live inside the workbook; restoring one first backs up the current state. Version history travels with copies of the file.

There is no server coordinating simultaneous edits. File checks and browser warnings cannot make a network drive or sync service atomic. Keep the one-editor rule even when the app detects a changed file.

Earlier releases used a connected `app/data` directory with a file for each schedule. Existing browser profiles can still reopen that legacy mode, but new setups use workbooks. Legacy locks depend on timely folder sync and remain advisory. A recovered legacy draft opens as a separate workbook so it cannot silently overwrite the shared original.

## Layouts and printing

Four layouts show the same schedule: **Bands** for a main track with concurrent events, **Grid** for a chronological table, **Cards** for complete main events and assigned commitments, and **Phases** for activities grouped under their main block. The selected layout applies to the schedule.

An **Audience** is a group or section. Primary audiences normally appear on the main track. Supporting or unassigned events need **Main Track** enabled to join it. **Specific People** describes people who need something different from the audience's main activity. Concurrent events are allowed; check overlap warnings in the context of the people involved.

Use the app's **Print** action or `Ctrl/Cmd+P` to review days, audience and detail. Schedule checks flag dates, ranges and possible assignment conflicts for review.

**Bands** uses the approved day-first paper layout: a prominent main schedule, a separate chronological concurrent-event list, and **Notes & Reminders**. Each event appears in full once. Matching circled numbers link every main block that overlaps a concurrent event; events entirely in gaps remain in the timed concurrent list. Read down the left column, then the right. A third column is a last-resort overflow column after the two-column spacing and type options are exhausted.

Bands uses one US Letter portrait page per day, with half-inch margins. Its optional logo is one inch square, and the notes area reserves 1¼ inches by default. **Customize → Basics** retains the schedule title and optional subtitle and adds logo visibility and notes-space choices. **Emphasize this event** marks chosen day anchors or concurrent events. **Schedule section → Main schedule / Concurrent event** controls placement independently of the audience, meal/break flag or emphasis. **Flight activities** supports shared or differing activity times inside a parent event.

Existing version-1 and version-2 workbooks still open in their original sections. New saves use workbook format 3 so older app builds reject them instead of dropping explicit event placement, flight activities or Bands settings. Distribute the updated app alongside new workbooks.

**Names or attendance details** stays free text. Existing records print as entered. **Name layout** in the inspector and Quick Edit offers an explicit separator choice and complete preview; it never guesses which words to remove. Use semicolons or one person per line for reliable separation, including names that contain commas. Large rosters stay with their event, and roster length does not choose highlighting.

Screen and print use the same Bands renderer. Fitting reduces spacing before type, with floors of 9 pt for details, 10.5 pt for small-event names, 9.5 pt for large-roster names and 11.5 pt for main titles. Navigation labels have an 8 pt floor; the footer uses 7 pt. Lighter days gain larger main text and more space, up to a cap. If a complete day cannot fit, the editor retains all its content and shows a warning. App printing is blocked, and native printing shows a not-ready notice for that day instead of issuing a partial schedule. Print at actual size on Letter, with browser headers/footers off; duplex can put the next day on the reverse.

Grid, Cards and Phases now default to **Fit each day on one page**: Letter portrait, half-inch margins, complete event records and bounded type sizes. They share the optional logo, title/subtitle and reserved Notes & Reminders space. Fit blocks printing when a day exceeds the readable limits; **Readable pages** is an explicit alternative that may span sheets. Browser **File → Print** prepares fresh output for all days using each layout's policy. Use app Print review for particular days, audiences or overview. See the [alternate-view guide](support/docs/ALTERNATE-VIEWS.md) for reading paths, print limits and verification.

An audience handout includes primary-audience events and breaks. It is a filtered presentation, not a redaction tool: review named exceptions and day notes before sharing. Check the browser's print preview as paper settings affect the result. When embedded, open the standalone app in its own tab for printing so the host page is not included.

**Customize → Look** offers preset palettes and editable custom colors with a text-contrast warning. The editor's light/dark toggle is separate from the schedule's printed appearance.

## Boundaries

- Events stay within one day. Times use 24-hour wall-clock labels, such as `0730`; there are no time zones, recurrence rules, or reminders.
- There are no accounts or access controls inside the workbook. Anyone with a copy can read and edit its contents, including saved versions. Use your file-sharing system to control access.
- Logos are stored inside the workbook and recovery copy and must be supported image files under 2 MB.
- Browser recovery and remembered file permissions depend on the browser profile and origin. Private browsing, storage restrictions, moving the app, or clearing browser data can affect them.
- An iframe has its own UI document, but a same-origin host can still read or modify it. Use a trusted host. Multiple app instances on the same origin share browser persistence; keep one editor open at a time.

## Build and distribute

Python 3.10 or newer is required for the packaging tools. Source files run directly in a browser without a build step.

```bash
python3 tools/build-single-html.py
```

This writes `dist/DaySchedule.html`, including scripts, styles, the MIT notice, and a build stamp such as `2026-09-10+012345abcdef`. The hash identifies the bundled content, including uncommitted source changes. The file is an app shell: schedule data belongs in `.schedule` files. The builder refuses non-placeholder content in `app/data/scheduledata.js`, removes placeholder comments, and requires the app's Content Security Policy.

Use current Chrome, Edge, Firefox, or Safari. The iframe build uses ordinary document isolation and no longer requires CSS `@scope`; there is no separately claimed old-browser minimum. Native file autosave depends on browser support, permissions, and whether the app is embedded.

### SharePoint and other hosts

The modern SharePoint **Embed** web part accepts iframe embed code; it does not accept arbitrary script tags. It is different from an administrator-approved custom HTML or SPFx host. See Microsoft's [Embed web part guidance](https://support.microsoft.com/en-us/office/add-content-to-your-page-using-the-embed-web-part-721f3b2f-437f-45ef-ac4e-df29dba74de8).

For the modern Embed route, publish `DaySchedule.html` at an approved HTTPS URL that serves it as HTML and permits framing, then generate a URL-based snippet:

```bash
python3 tools/build-sharepoint-embed.py --app-url 'https://approved.example/DaySchedule.html'
```

Copy the generated `<iframe …></iframe>` from `dist/DaySchedule.sharepoint.html` into the Embed web part. Your SharePoint administrator must allow the host domain. The app host's framing policy and authentication must also permit the deployment. A SharePoint document-library download link is not automatically an executable app host. Cross-origin frames can restrict native file pickers; opening the app URL in its own tab is the supported route for reliable file autosave.

For an approved host that accepts a complete HTML snippet, build the self-contained version:

```bash
python3 tools/build-sharepoint-embed.py --build-dist --height 900
```

This rebuilds the standalone app and places that complete document in an iframe's `srcdoc`. Its CSP and license stay inside the frame. The host gets no app scripts, styles, keyboard handlers, or global boot guard. Removing and reinserting the frame creates a new app instance. The host can still impose stricter CSP or storage policies; same-origin `srcdoc` is UI isolation, not protection from a malicious host administrator.

Both commands write the same snippet path, so distribute the mode you intended. `--height` sets the frame height in CSS pixels. Test the actual host's page width, scrolling, storage access, save workflow, and print workflow before rollout. The repository's synthetic-host tests do not certify a live SharePoint tenant.

## Verify changes

Run the build regressions; outputs stay in temporary copies:

```bash
python3 tools/test-builds.py
```

With Playwright and its browser engines installed, run iframe regressions:

```bash
node tools/test-embed.cjs
```

If Playwright is installed outside the normal Node module search path, set `DAYSCHEDULE_PLAYWRIGHT_MODULE` to its module directory. This suite checks Chromium, Firefox, and WebKit host isolation, dark mode, remounting, frame CSP, fallback downloads, and `file://` boot. It also verifies that a cross-origin frame downloads a valid workbook when Chromium rejects the native picker. The tests use local loopback origins and do not operate native file-picker or print dialogs.

Run the complete browser harnesses and user flows with the same Playwright setup:

```bash
node support/tests/test-browser.cjs
```

This command starts its own local server and uses isolated browser contexts in all three engines. Set `DAYSCHEDULE_BROWSERS=chromium,webkit` to select engines; the embed suite accepts the same option. It covers startup, mobile layout, keyboard operation, exact-minute edits, printing, custom colors, download/reopen, dated duplication, archive/restore, and version management. It writes evidence to the gitignored `output/playwright/release/` directory and does not use your browser profile.

With Chromium and Poppler's `pdftotext` and `pdfinfo` on PATH, verify emitted PDFs:

```bash
node support/tests/test-print-pdf.cjs
node support/tests/test-bands-pdf.cjs
```

The general PDF suite checks explicit Fit blocking and complete Readable output for 48 synthetic events in Grid, Cards and Phases, including Letter/A4. The dedicated Bands suite covers eight Letter pages: main-only, 15 surnames, 40 surnames with timed flights, and fifteen concurrent events, plus explicit overflow blocking. Run `node support/tests/test-alternate-views.cjs` for fixed and seeded alternate-view cases, mobile editing and actual PDFs. `python3 support/tests/build-alternate-review.py` verifies physical page bounds and builds a portable visual comparison (requires pdfplumber, pypdf and Poppler). See the [alternate-view guide](support/docs/ALTERNATE-VIEWS.md) and [Bands stress-test record](support/docs/BANDS-STRESS-TEST.md) for evidence and limits.

For the complete new-author workflow (including keyboard, mobile, multiline names, flights, reminders and download/reopen), run `node support/tests/test-authoring-ui.cjs`. See the [Bands authoring guide](support/docs/BANDS-AUTHORING.md) for the control-to-output mapping and design rationale.

Run reproducible randomized Bands layouts and real editor actions with:

```bash
node support/tests/test-bands-random.cjs
python3 support/tests/verify-bands-random.py
```

The default is 100 two-day synthetic workbooks in Chromium and WebKit, plus UI add/edit/delete/Undo/Redo and download/reopen sequences. `DAYSCHEDULE_SEEDS` and `DAYSCHEDULE_START_SEED` control replay; `--layout-only` and `--ui-only` select a portion. The PDF verifier requires `pdfplumber`. Failing seeds, screenshots and PDF evidence stay under ignored `output/playwright/`.

For an interactive review, open `support/tests/bands-integration.html`. Its synthetic workbook loads through the real app parser. **Capture print proof** records the actual print fitter's choices. `freeze-band-proof.cjs` turns a saved capture into script-free HTML using the production renderer and checks that its text matches the browser. `verify-band-proof.py` checks emitted PDFs with pdfplumber and pypdf. These developer tools are not bundled into the app.

Serve the repo root and open the app harnesses in each target browser:

- `support/tests/runner.html`: utilities, schema, data helpers, and store.
- `support/tests/runner-integration.html`: asynchronous storage and persistence with an in-memory file-system mock.
- `support/tests/runner-ui.html`: real app-shell, rendering, and print-layout behavior.

For example, use `python3 -m http.server`. Hard-reload after edits or use a fresh port to avoid cached scripts. Test the standalone build as a local file as well as over HTTP. `tools/sharepoint-host-check.html` is a manual synthetic host for the generated iframe snippet.

If something breaks, open **Help → Shortcuts** and include the build stamp and relevant local error-log entries in the report. Review error details before sharing them. Neither the log nor the report is uploaded by DaySchedule.
