# Authoring a Bands schedule

The editor asks where an event belongs, who attends, and whether to emphasize
it as separate questions. Authors do not need to understand an override rule.
The existing toolbar, day tabs, inspector, Quick Edit and Customize remain.

## Enter an event

1. Choose **+ Event**. Enter the title and start/end times. You can edit Start
   and End in either order. An incomplete range stays visible while moving
   between the fields; leaving an invalid pair restores the previous times
   with an explanation beside the fields.
2. Choose **Main schedule** or **Concurrent event** under **Schedule section**.
   New events start on the main schedule. Changing the audience, meal/break
   flag or emphasis keeps the selected section.
3. Choose the audience. For an individual assignment, choose **Specific people
   / other** and enter everyone who must attend. Leave names blank when the
   whole selected audience attends.
4. Add the location, point of contact and event instructions as needed.
5. Use **Emphasize this event** for a day anchor or highlighted concurrent
   event. It changes appearance, not attendance or placement.

On an ordinary main event, the optional name controls start collapsed. They
open for a concurrent assignment, specific audience or existing attendee text.
**All event options** in Quick Edit opens this same full editor. The event
title stays visible while scrolling the desktop inspector. **Dates & hours**
returns to day setup; **More → Undo last edit / Redo** recovers changes.

Use **Manage audiences** beside **Who attends** to add or adjust groups.
Overlapping assignments with matching name entries show a linked review notice
as you edit. Confirm identity: matching surnames can belong to different people.
An intentional main/concurrent exception does not produce that warning.

## Names

**Names or attendance details** accepts free text. **Name layout** is available
in both the inspector and Quick Edit, with a preview of the actual entries.

| Choice | Use it for |
| --- | --- |
| Keep text as entered | Attendance prose or text that should remain a single block. |
| Separate at commas, ; or & | Lists such as `Doe; Smith; Chan` or `John Doe, Alex Smith & Dmitri Chan`. Check the preview. |
| One entry per line | Full names containing commas, compound surnames, or a pasted roster. |
| One surname per space | Only lists where every word is a separate surname, such as `Doe Smith Chan`. |

Separator detection gives line breaks priority, then semicolons, then commas
and spaced ampersands. The preview explains which rule was used. It never
removes name parts or duplicate entries. For ambiguous mixed input, one entry
per line gives the author direct control over each entry.

Quick Edit preserves line breaks and updates its preview while typing. Long
structured lists use the existing compact roster treatment. Roster length does
not select emphasis. Existing print limits still apply: complete content stays
visible for editing, and an overfull day cannot silently print a partial list.

## Controls and printed results

| What to enter | Where to enter it | Result in Bands |
| --- | --- | --- |
| Main or concurrent placement | Event → Schedule section; Quick Edit → Schedule section | Main band or separate chronological concurrent entry. Matching numbers follow every strict time overlap automatically. |
| Attendance | Event → Who attends; Quick Edit → Audience and names | Audience and complete literal attendee text or entries. |
| Location, contact, instructions | Event → Where & what to know; corresponding Quick Edit fields | Details next to the event. Empty optional fields are omitted. |
| Day anchors or an important assignment | Event → Emphasize this event | Emphasis on the chosen main band or concurrent event. |
| Meal or break | Event → This is a meal or break | The existing meal/break classification, independent of placement and emphasis. |
| Shared or differing flight times | Event → Flight activities | Nested flight details within the event. |
| Untimed notes | + Reminder | Notes & Reminders at the bottom of that day. An optional heading groups the text. |
| Title and subtitle | Customize → Basics → Page heading | Free title and optional subtitle; neither requires an organization name. |
| Logo | Customize → Basics → Logo | Optional one-inch square at the left of the heading. |
| Reminder space | Customize → Basics → Notes & Reminders | 1¼, 1½ or 2 inches reserved before fitting events. |
| Color | Customize → Look → Colors | Existing paper themes or custom colors. |

Flight activities start with the parent event's full time range. Each entry
expands for editing; add another entry for another activity by the same flight.
**Use event time** restores the parent's current range. If the parent time
changes, out-of-range activities show **Review times**, including in collapsed
entry headings. The app does not silently shift custom flight times.

The Flight field suggests existing audience and flight names but accepts free
text. Typing a flight name does not create or change an audience.

Audience roles are **Shared** and **Specific**. They describe the audience;
they do not move events when edited. They retain their existing role in the
main heading and other views. The user's established attendance rule remains:
people assigned to a concurrent event attend it during its stated interval.

## Print and hand off

**View** on the toolbar switches layouts. **Customize** retains headings,
colors, audiences, the optional logo and reminder space. **Print** is on the
toolbar; **More** contains Undo/Redo and Saved versions.

Print defaults to **Full schedule — all events and assignments**. A **Group
handout** includes shared main events, that group's events and reminders.
**Include named assignments without a group** starts checked because the app
cannot infer a person's group from their name. The dialog lists every excluded
event and still checks all events on the selected days for conflicts.

Use **Save .schedule** for a complete workbook, including sibling schedules
and saved versions. **Opened** means an imported file has no edits yet.
**Unsaved** means work needs saving. In a browser without file autosave,
**Download .schedule** creates a new copy; **Downloaded** confirms the browser
sent it to Downloads. Send the newest copy and agree on one editor at a time.
With a writable file, use **Save Now** and wait for **Saved**.

**Customize → Export → Legacy compatibility** exports only the current
schedule as `.js`. It excludes other schedules and saved versions and does not
mark unsaved workbook edits as saved. Use it only for legacy compatibility.

## Compatibility

Workbook formats 1 and 2 open with their original inferred placement. Opening
an event does not change its data. Editing its audience or meal/break flag
preserves the section currently shown. Editing or removing an audience also
preserves existing event positions across days.

An optional `placement: "main" | "concurrent"` field records an explicit choice.
All section classification uses the shared helper. Legacy `isMainEvent`, group
scope and break behavior remain the fallback for records without that field.
Saves use workbook format 3. Older builds reject format 3 rather than silently
dropping the new field. Share the updated app with newly saved workbooks.
Undo/Redo, recovery, versions and inactive schedules preserve the field.

## Design basis and verification

Visible, mutually exclusive section choices follow the recognition principle:
show the options rather than require authors to recall an internal rule.
[NN/g: Recognition vs. recall](https://www.nngroup.com/articles/recognition-and-recall/)
and [GOV.UK: Radios](https://design-system.service.gov.uk/components/radios/).
Optional name controls on ordinary main events and expandable flight entries
apply [NN/g: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
These are design principles; they do not establish novice usability for this
particular app without observation of actual authors.

Verification on 2026-09-14, build `2026-09-14+3af976eceef6`:

- Chromium 147 and WebKit 26.4 passed 134 unit, 68 persistence and 131 UI checks
  each, plus the existing real-app workflows: 666 harness checks in total.
- Both engines completed a new-author journey using actual controls: explicit
  placement, 40 surnames, multiline full names, shared/differing flight times,
  six reminders, heading settings, keyboard radios, 390px editing and a real
  download/reopen. No page errors occurred.
- Seeds 1–24 exercised mixed legacy/explicit choices, including choices that
  contradict old flags: 96 day renders and 192 UI add/edit/delete sequences
  passed. Intentionally overfull days retained content and reported overflow.
- Eight approved Letter PDF pages passed, plus the new-author page and three
  randomized pages. The latter four passed physical margin, field/name and
  font-floor checks. The new-author PDF retained all 40 names, three flight
  activities and six reminders on one Letter page and was visually inspected.
- Desktop inspector, Quick Edit, mobile and print captures were reviewed.
  Nine packaging checks passed; both distributions were rebuilt. Chromium and
  WebKit also passed the embed suite, including host isolation, CSP, dark theme,
  remounting, downloads and local-file startup.

Run `node support/tests/test-authoring-ui.cjs` with
`DAYSCHEDULE_PLAYWRIGHT_MODULE` pointing to an installed Playwright package.
Use `DAYSCHEDULE_BROWSERS=chromium,webkit` to select the available engines;
`tools/test-embed.cjs` accepts the same option and still defaults to all three.
The other commands are in the README. Evidence is under ignored
`output/playwright/authoring/` and `output/playwright/authoring-stress/`.

Firefox automation could not start in this environment. Actual Safari/Edge
releases, native dialogs, physical printing and live SharePoint deployment
remain separate checks. A short observed exercise with unfamiliar authors
should test whether they can create an ordinary event, a named exception and
a flight block without coaching; this pass does not claim that result.

## Authoring and handoff verification — 2026-09-15

The bounded readiness pass addresses paired time edits, full-workbook handoff,
explicit print filtering, contextual audience management, linked assignment
checks, and compact desktop/mobile controls. It leaves the approved Bands
renderer, fitter, palettes and paper stylesheet unchanged.

The regression journey is `support/tests/test-authoring-handoff.cjs`. It starts
with an empty workbook, creates two schedules, preserves a named version,
prints a 40-surname assignment with flight activities and six reminders, then
saves and reopens the full workbook. It also checks explicit print exclusions,
legacy export status, Undo/Redo, 44px toolbar targets and keyboard modal return.
Set `DAYSCHEDULE_TEST_DIST=1` to exercise the built app and
`DAYSCHEDULE_HANDOFF_OUTPUT` to choose an evidence directory. Browser and
Playwright module options are the same as the earlier authoring test.

Build `2026-09-15+7bb7924abd8d` passes 696 unit/persistence/UI harness checks
across Chromium and WebKit, both authoring journeys, full-workbook save/reopen,
PDF regressions and nine build checks. The release-file journey retains two
schedules and a named version, with no page errors. Both distributions pass
local-file and embedded-host checks. Evidence is under
`output/playwright/authoring-handoff/`.

This is automated regression and expert visual review. It does not replace
observing a new author or testing the real deployment's file/print dialogs.
