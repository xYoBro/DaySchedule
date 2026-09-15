# Approved Bands integration

Build: `2026-09-14+424ea8544b5c`.

The approved day-first prototype now runs inside the main app. The existing toolbar, day tabs, Quick Edit, Customize and inspector remain the editing shell. The old attached-event Bands renderer and whole-page print shrinking have been replaced by one shared paper renderer and fitter. The isolated prototype remains banked under `output/prototypes/day-first-adaptive/`.

## Behavior

- Main bands remain prominent, with fixed time/location/POC fields, quiet separators and optional manual emphasis. Emphasis is independent of the existing Main Track setting and is never inferred from roster length.
- Concurrent events appear in full once, in chronological order down the left column and then the right. A third column is considered only after exhausting the two-column spacing/type path. Circled numbers come from the same ordered model as the entries and link every strictly overlapping main block. Endpoint touches do not overlap; gap events remain in the full list.
- Letter portrait is fixed at 612×792 pt, with 36 pt margins, an optional 72×72 pt logo and at least 90 pt for Notes & Reminders. Title and optional subtitle remain author-entered. Lighter days gain main type and spacing up to a cap.
- Details stay at or above 9 pt; small-event names at 10.5 pt; large-roster names at 9.5 pt; main titles at 11.5 pt. Navigation labels have an 8 pt floor and the footer is 7 pt. Entire days and rosters are not scaled as images or divided across sheets.
- A day that exceeds these limits stays complete and visible for editing. The app disables incomplete printing. Browser File → Print produces a visible not-ready notice for that day. Print at actual size on Letter with browser headers/footers off; duplex can put the next day on the reverse.
- Existing attendee fields remain literal text unless the author chooses separator formatting. The inspector previews all entries and preserves names as entered, including full names, multiword surnames and repeated surnames. POC remains separate. Text matches between concurrent assignments are advisory, not identity proof. The user's established concurrent-attendance exceptions remain intact.
- Nested flight activities support shared or differing times within the parent. New controls use Store, Undo/Redo, recovery, versions and workbook persistence. Existing duplicate/contact-clearing behavior also clears nested POCs. The other layouts retain the flight text pending their separate design review.
- Existing palettes remain available, with Forest, Teal, Slate, Plum, Burgundy and Copper added. Bands honors custom paper/text colors and the existing separate editor appearance setting.

## File compatibility

Existing workbook format 1 still opens. New writes and recovery snapshots use format 2. The pre-integration app rejects format 2 before loading it, preventing its older normalizer from silently dropping flight activities or formatting choices. Distribute the updated app with newly saved workbooks. There is no runtime dependency or application network access added by this integration.

## Verification in this session

- 134 unit checks, 68 persistence integration checks and 120 UI checks passed through the in-app browser. The UI suite covers all four renderers and existing editing/print lifecycles, plus Bands field preservation, full-overlap/gap references, two-column 15/40-name cases, fifteen concurrent events, main-only days, flight editing, custom colors, optional logo, Undo/Redo, versions, old/new workbook round trips, inactive siblings and explicit overflow blocking.
- A banked pre-integration parser rejected the format-2 synthetic workbook with the expected unsupported-version message.
- Nine packaging regressions passed. Source JavaScript/Python syntax, referenced asset paths and diff whitespace were checked. Standalone and iframe distributions were regenerated from source.
- Eight actual Letter PDF pages and eight grayscale counterparts passed field/name retention, flight times, page count, font floors, logo/notes dimensions and ink-margin checks. All color pages were visually inspected, with final dense and three-column pages rechecked after spacing polish, and the dense grayscale page inspected.
- The PDF input was script-free HTML frozen from the production renderer using live app fitter decisions. Every page's text checksum and attendee count matched its browser capture. Installed Chrome 152 converted those files in an isolated temporary profile. Proof: `output/pdf/integrated-bands/`, including `verification.json` and both PDF packets.
- The 15- and 40-surname examples use two columns on both days, including the 40-name timed-flight Sunday. Only the deliberately crowded fifteen-concurrent-event Saturday needs a sequential third column. Event count alone does not guarantee fit for arbitrary titles, names or notes.

One same-origin persistence rerun encountered a recovery-record isolation failure. The same source passed all 68 checks on a clean localhost origin; browser tests should use isolated contexts/origins rather than share recovery storage with another app or harness. No recovery timing workaround was added for that failure.

## Remaining release checks

The three-engine Playwright release and embed scripts were updated where the Bands contract changed but were not executed in this session. The earlier three-engine and 48-PDF results described the superseded attached-event layout and do not certify this build. Native OS file-picking/printing, actual Edge/Safari, `file://` startup, physical printer output and live SharePoint policies still require release checks. The native picker was unavailable to browser automation; synthetic files were loaded through the real parser in a local developer review page.

Deployment and merge remain outside this integration. Grid, Cards and Phases retain their current designs; reviewing and improving them is the next phase after the integrated Bands experience is settled.
