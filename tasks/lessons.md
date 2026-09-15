# Reliability release lessons

- Evaluate external critiques against confirmed user decisions. Full time
  overlap is the correct meaning of the “Concurrent events” references; keep
  one complete record and repeat only its shared number beside overlapping
  bands. Endpoint contact is not overlap. Wholly gap events remain chronological
  complete entries. This supersedes the earlier start-only linking policy.
- A matching surname is a possible assignment clash, not proof of identity.
  Preserve literal entries, compare concurrent assignments only, and do not
  flag the user's intended main-schedule exceptions as conflicts.

- Main-event metadata needs stable columns: concurrent reference badges must
  not push location or POC sideways. Keep a short event with no details compact.
  Recheck actual PDF margins after changing row flow; a browser fit near the
  boundary can still overrun in print. The current layout reserves 4 pt clearance.

- The logo is optional. Reserve its one-inch square only when enabled; when
  disabled, release both its column and unused header height, retain the user's
  image for restoration, and let the title align with the main schedule.

- A separate strip explaining appointments that start between main bands adds
  a second navigation scheme without adding event information. Keep exact times
  in complete concurrent entries; link to actual overlapping main bands. Dense main
  bands still need a visible event boundary: use quiet rules that span the time
  gutter and details without consuming print space or competing with anchors.

- The 40-person capacity specimen uses surnames, as the user specified. Do not
  let an artificial full-name stress case dictate the everyday composition.
  Keep the complete event together and allow its large roster's type to reduce
  independently. Preserve actual author input; never infer surnames to fit.

- A minimum-height arrangement can be a reading-order regression. Do not restart
  concurrent columns above and below a full-width roster. Exhaust the complete
  two-column fitting path before considering a third column; judge continuous
  top-to-bottom navigation, not only correct numbering and PDF bounds.

- Screen line boxes are not enough to prove print margins. Check the PDF's
  actual glyph bounds: font overhang can extend beyond a heading or footer box.
  Reclaim roster spacing before reducing type, and test long literal names
  alongside flight details. A faithful script-free snapshot can be printed by
  a local document renderer; verify its text against the live browser first.

- Page fit must include physical margins and per-field type floors. A flowing
  full-width roster can preserve chronological event order and reclaim unused
  grid space. Author-selected highlighting must not add padding or larger type
  that unexpectedly changes capacity. Reserve print clearance inside the body;
  the auto-pinned footer already consumes the exact bottom content boundary.

- A user's example title is not a default. The page title is unrestricted
  schedule-specific text supplied by the author; start blank and do not seed
  a conference or organization name through a special preview URL.

- The header's primary field is a page title: it may name an organization or an
  event such as Professional Development Conference. Keep the subtitle optional
  and allow title wrapping within the reserved header before reducing type.
- A light day's concurrent section needs its own composition. Prefer one
  chronological list when a few short entries fit comfortably; retain columns
  for large rosters. Empty space is acceptable and should not force larger cards.
- Check individual critical type styles, not just the nominal body size: timed
  flight labels can fall below 7.5 pt while the complete page still passes fit.

- Before opening a local prototype for the user, verify its server is listening
  and then confirm the rendered page in the user's browser. A queued tab is not
  proof that the page loaded. Preview processes must survive command/turn exit;
  port 8767 was restored with a detached localhost-only server after it stopped.

- Flight names must not occupy the main schedule's time column. Nest flight
  assignments under their parent activity, keep the shared time alongside the
  whole block, and put individual activity times inside each flight's row.

- Free-text attendee fields cannot reliably establish name boundaries from
  spaces or commas alone. Preserve the original field and complete entries,
  make the suggested split reviewable, and offer a literal-text mode. A repeated
  surname is not proof of a duplicate person. Keep POC formatting independent.
- Geometric roster fit alone can produce poor name scanning: a three-column
  layout may wrap full names even when two columns can keep them intact. Favor
  complete entries and visibly indent natural continuations; do not break words
  solely to force a narrow roster column.

- Attendee entries usually contain surnames only; POC fields may include rank
  and name. Treat these as separate inputs. Preserve supplied name parts; do not
  invent missing parts or strip provided information to fit a print layout.

- Concurrent titles, times and surnames at similar bold weights obscure the
  name-finding task. Reserve strong emphasis for attendee identity within each
  concurrent entry; keep main-track prominence through its separate hierarchy.

- Readers rejected compressed main-band number ranges. Use the same individually
  circled identifiers at both ends and an explicit “Concurrent events:” label.
  Saving a few symbols must not introduce a translation step for the reader.

- Main-band location, POC and event instructions need distinct, consistent
  positions rather than one concatenated sentence. Repeated “Concurrent starts”
  gap rows are visual clutter; consolidate navigation while retaining true times.
- Flight training is part of the main track. Support both one common window
  with different flight assignments and individual timed activities per flight.

- The main schedule must remain the visual anchor even when concurrent rosters
  occupy more area. Preserve name legibility and use hierarchy, contrast and
  available-space allocation to give the main track priority. Show light-day
  samples explicitly; never silently hide events to make the main track bigger.

- The paper prototype's unit logo now occupies a fixed 1 × 1 inch square on the
  left (superseding the earlier 1.5-inch request), with an editable title above
  the day/date. Visual event emphasis is the user's choice; long-roster layout
  serves complete attendance independently of emphasis.
- Keep the logo square and reserve it before fitting schedule text.
  Keep the header free of attendance instructions; use “Concurrent events” as
  the section name. Start-time references must represent gaps honestly.

- Reserve the logo and the user's required notes area before evaluating print capacity. For this schedule, the baseline largest roster is 15 names; 40 is a stress case, not the default presentation. The selected Day first prototype must keep 1.25 inches for about six non-timed reminders.
- When fitting this one-day-per-Letter-side design, adjust event allocation, spacing and then text size. Never shrink the entire page or its branding to fit, and never let a day spill into the next day's printed page.

- A save needs both a captured revision and document identity. A completed write may acknowledge its snapshot; it must not replace later live data. Test paused reads, writes, and closes with edits and navigation in between.
- A durable browser backup is shared across tabs. A newer timestamp or matching workbook ID does not establish that it is the right draft for a tab. Prefer valid tab-local recovery and delete only the exact backup being cleared.
- Protect a version checkpoint in memory and recovery before awaiting its file write. A later version action must carry forward a failed checkpoint after validating the disk baseline.
- DOM print measurements cannot prove pagination or field fidelity. Keep responsive rules screen-only and inspect emitted PDFs with unique content markers. Narrow columns can split words during text extraction, so compare robust markers rather than prose line breaks.
- A modal's opener can be replaced by a rerender, and stacked dialogs need one focus/Escape lifecycle. Restore focus after rerendering, and test keyboard-triggered opening because mouse-focus behavior differs by browser.
- Readable Bands must preserve the main/concurrent relationship. A flat list can save space while removing the context that makes the view useful. Preserve the user's visual model before optimizing density.
- Reserve headers, footers and page-number width before fitting content. Native File → Print must prepare the same current readable model as app printing; beforeprint cannot await image decoding.
- A one-page Fit pass does not prove readability. Compare physical PDF text geometry on Letter and A4; a fixed CSS paper size can shrink type even when the content width fits. Oversized-entry splitting must advance payload and preserve grapheme boundaries.
- In focus-sensitive tests, move to the next actual control rather than issuing duplicate synthetic blur events to BODY. Otherwise modal initial-focus callbacks can race deferred validation; capture original values instead of comparing mutable Store aliases.
- A layout correction is incomplete when it appears only in exported output while the working preview still shows the old design. Verify the surface the user is looking at, share the content renderer, and test editing/keyboard affordances separately from physical print pagination.
- Test dense screen geometry in the actual application shell. A harness wrapper can hide flex stretching that fixes the paper background at viewport height while its contents overflow. Verify event/note/footer bounds and scroll to the final content; a clipped ancestor also makes a full-element screenshot misleading.
- Preserve an explicitly liked visual design by reusing its renderer and CSS. Improving concurrency does not authorize replacing time gutters, typography, audience badges, headers or notes. Check the actual appearance against the original, and require Fit/readable/screen to share a renderer; passing separate tests for different designs misses the user's requirement.

## Approved Bands integration — 2026-09-14

- Fit only after the editor is visible. Import can render behind the library; zero-size geometry gives a false overflow and unnecessary third column. Refit upon revealing the editor.
- Port root density selectors as root modifiers (`.band-sheet.compact`), not descendant selectors. Validate the dense 40-name case in the real app after scoping prototype CSS.
- Screen and PDF must share the renderer and physical fitter. Freeze live decisions only after checking content checksums, then verify the actual emitted PDF margins and text sizes.
- An HTML load event does not mean async recovery finished. Expose/await appReady in developer consumers instead of racing startup or adding arbitrary delays.
- Run browser harnesses with isolated origins/contexts: shared durable recovery can contaminate another test. A clean-origin persistence run passed after one same-origin recovery isolation failure.
- New persisted fields require an older-writer safeguard. Workbook format 2 prevents the old normalizer from silently deleting nested flight activities; keep format-1 import support and test the old parser's rejection.
- Trace new nested data through every existing operation, including version snapshots and duplicate/contact clearing. Preserve custom color controls when replacing a renderer.
- Test complete app-generated PDFs as well as frozen paper specimens: an empty editor wrapper before a named page can add a blank first sheet even when the schedule itself fits.
- Before shrinking dense rosters or adding a third column, measure alternative widths in both directions. A narrow allocation search can reject a valid two-column page.
- PDF geometric text reconstruction can interleave adjacent columns. Use content-stream text for fidelity assertions, and retain independent visual and physical page checks.
