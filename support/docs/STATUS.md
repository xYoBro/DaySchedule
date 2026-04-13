# DaySchedule — Status Notes

**Last updated:** 2026-04-13

## What's Shipped in Current Workspace

### Schedule Library
- Home screen with schedule list, create, duplicate, delete
- File-per-schedule JSON storage in `app/data/` via FSAPI
- IndexedDB-persisted directory handle (survives browser restarts)
- Auto-save (2s debounce) + Ctrl+S manual save
- Text-based save indicator (Saved/Saving.../Unsaved/Not connected)
- Stale-data detection for Teams/OneDrive concurrent editing
- Named version snapshots with restore + auto-backup
- User identity via localStorage
- Legacy fallback for non-FSAPI browsers
- Migration from existing scheduledata.js
- Teams sync guidance (3-step setup, sync confirmation modal, help panel)
- Help panel with keyboard shortcuts and workflow tips

### Themes & Layout Skins
- 4 layout skins: Bands (default), Grid, Cards, Phases
- 5 color palettes: Classic, Air Force, OCP, Dark Ops, Mono
- Custom color slot (UI exists but picker not wired yet)
- Editor dark mode (light/dark toggle in library header)
- Settings → Appearance tab with skin thumbnails + color swatches
- Per-schedule theme in JSON, editor chrome theme in localStorage
- CSS custom properties for all schedule + editor chrome colors
- Render dispatcher with skin-specific renderer modules

### Event Authoring
- Right-side event inspector for title, time, group, attendees ("Who"), description, location, POC, and break/highlight toggles
- Day Sheet modal for the active day: table editor with inline start/end/title/group/location edits
- Expandable Day Sheet detail rows for attendees, POC, and description
- Day Sheet add/delete actions plus "Inspector" jump-back for single-event edits
- Overlap warnings in the inspector and Day Sheet, including highlighted limited-scope events
- Attendees rendered in band/cards/phases layouts and preserved on new events / import normalization

### Testing
- 56 browser-based unit tests (`support/tests/runner.html`)
- 29 browser-based integration tests (`support/tests/runner-integration.html`) with in-memory FSAPI mock
- 15 browser-based UI harness tests (`support/tests/runner-ui.html`) covering render/skins, shell flows, and print behavior
- Cross-file contracts on all JS modules

## Known Remaining Work

### Themes (next session)
- [ ] Visual polish on grid/cards/phases skins
- [ ] Custom color picker ("+" button) — not wired, only presets work
- [ ] Remove "Save to File" button from Appearance tab modal actions
- [ ] Print testing with each skin
- [ ] Grid skin layout tuning with dense data
- [ ] Cards and phases skins evaluation with 27-event sample

### Bugs Found & Fixed During Development
- `returnToLibrary()` race condition — fire-and-forget save lost data (fixed: await)
- `writeScheduleFile` could leave files corrupted on error (fixed: writable.abort())
- `getCurrentScheduleFileData()` returned null for non-library boot paths (fixed: auto-create fallback)
- Event click handler only matched `.band` — grid/cards/phases clicks didn't work (fixed: `[data-event-id]`)
- `saveCurrentSchedule()` didn't sync theme from in-memory state (fixed: copy before write)
- Band `.main` colors were hardcoded, not using CSS vars (fixed)
- Sample data had no main-scope anchors, so limited events weren't concurrent (fixed)
- Conflict warnings skipped highlighted limited-scope events (fixed: conflict check now uses `classifyEvents()`)
