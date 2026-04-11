# Schedule Library — Design Spec

**Date:** 2026-04-10
**Problem:** Data loss from manual save step — airman forgot to export `scheduledata.js` before transferring the folder, and navigating away in the browser destroyed the in-memory state.
**Solution:** Transform DaySchedule from a single-schedule editor with manual export into a persistent schedule library with auto-save, version history, and file-based storage that syncs via Microsoft Teams.

---

## 1. Schedule Library (Home Screen)

The app opens to a **schedule library** — a clean list of all schedules, sorted by last modified (newest first).

### Layout
- Each row displays: schedule name, day count, event count, last edited timestamp, status badge (Draft / Final)
- Prominent **"+ New Schedule"** button at top of the list
- Tap a schedule row to open it in the editor
- Right-click or long-press a row for context menu: **Duplicate**, **Delete**
- Delete requires confirmation

### First-Time Experience
- Empty list with just the "+ New Schedule" button
- No sample data, no onboarding wizard — the button is the instruction

### New Schedule Creation
1. Tap "+ New Schedule"
2. Inline text field appears, pre-focused — type a name (e.g., "June Drill")
3. Hit Enter — editor opens with an empty schedule, auto-save begins immediately

Three steps, zero decisions beyond the name.

---

## 2. Storage Architecture

### File Structure
One JSON file per schedule in the `data/` directory:

```
data/
  may-drill.json
  april-rsd.json
  march-rsd.json
```

Filenames are derived from the schedule name (lowercased, spaces to hyphens, special characters stripped).

### Schedule JSON Schema
```json
{
  "name": "May Drill",
  "createdAt": "2026-04-05T09:00:00Z",
  "lastSavedBy": "SrA Martinez",
  "lastSavedAt": "2026-04-10T14:32:00Z",
  "current": {
    "title": "May Drill",
    "days": [],
    "groups": [],
    "logo": null,
    "footer": {}
  },
  "versions": [
    {
      "name": "Draft for Review",
      "savedBy": "SrA Martinez",
      "savedAt": "2026-04-07T09:30:00Z",
      "data": { /* full snapshot — same shape as current */ }
    }
  ]
}
```

### Directory Access
- Uses the **File System Access API** `showDirectoryPicker()` to get a handle to the `data/` folder
- Directory handle persisted in **IndexedDB** — survives browser restarts
- On first launch: a modal prompts "Connect your data folder" with a "Choose Folder" button
- **Folder verification:** after selection, the app checks the folder name is `data` or contains expected files (e.g., `scheduledata.js`). If wrong folder, shows: *"That doesn't look like the data folder — it should be the 'data' folder inside DaySchedule."*
- On subsequent launches: handle is retrieved from IndexedDB silently. If the permission has expired, the browser prompts to re-grant (this is browser-native, not our UI).

### Loading Schedules
On app load, the directory handle is used to iterate all `.json` files in `data/`. Each file is read and its metadata (name, lastSavedAt, day/event counts) is extracted for the library list. Full schedule data is only loaded when a schedule is opened.

---

## 3. Save System

### Auto-Save
- **Debounce:** 2 seconds after the last edit, the working copy is written to the schedule's JSON file
- Every state mutation that currently calls `sessionSave()` also triggers the auto-save debounce
- sessionStorage continues running underneath as a crash-recovery layer

### Manual Save (Ctrl+S)
- Intercepts `Ctrl+S` / `Cmd+S` via the existing keyboard event handler
- Bypasses the 2-second debounce — writes immediately
- Toast confirmation: "Saved"

### Save Indicator States
All shown as a small dot next to the schedule title in the toolbar:

| State | Indicator | Meaning |
|-------|-----------|---------|
| All saved | No dot | Working copy matches what's on disk |
| Unsaved changes | Amber dot | Edits exist that haven't been written yet |
| Saving | Pulsing blue dot | Write in progress |
| Not connected | Red dot (clickable) | Directory handle missing or permission revoked — click to reconnect |

### Stale-Data Detection
Before each write:
1. Read the file's `lastSavedAt` timestamp
2. Compare to the `lastSavedAt` we loaded
3. If different, another user saved while we had the file open
4. Show warning: *"This schedule was updated by [name] at [time]. Load their changes, or overwrite with yours?"*
5. Options: **Load theirs** (discards local changes) or **Overwrite** (keeps local, replaces file)

This handles the Teams sync scenario where two people have the same schedule open.

### Attribution
Each save records `lastSavedBy` (user's name) and `lastSavedAt` (ISO timestamp) at the file's top level.

---

## 4. Version History

### Concepts
- **Working copy** (`current`): the live state, continuously updated by auto-save
- **Named version** (`versions[]`): a stamped snapshot with a user-chosen name — like a git tag

### Creating a Version
1. User clicks "Versions" in the toolbar, then "Save as Version..."
2. Text prompt for a version name (e.g., "Draft for Review", "Post-CC Final")
3. Current working copy is snapshotted into `versions[]` with name, savedBy, savedAt
4. Auto-save continues updating the working copy as normal

### Restoring a Version
1. User clicks "Restore" next to a version
2. **Safety step:** the current working copy is auto-saved as a version first (named "Auto-backup before restore, [timestamp]") so nothing is ever lost
3. The selected version's `data` replaces `current`
4. Editor re-renders with the restored state

### Version Panel UI
- Accessed via "Versions" button in the toolbar
- Shows the working copy at top (with last auto-save timestamp and who saved)
- "Save as Version..." button below that
- List of named versions below, newest first
- Each version row shows: name, who saved, when, and a "Restore" action

### Storage
Versions are embedded in the same JSON file as the working copy. At ~5-10KB per version, 10 versions per schedule is ~100KB — negligible for Teams sync.

---

## 5. Editor Integration

### What Changes
The existing schedule editor (day tabs, event bands, inspector panel, notes, groups, print layout) is **completely unchanged**. All modifications are additive to the toolbar.

### Toolbar Additions
- **Back arrow** (left side): returns to the schedule library
- **Unsaved dot**: amber indicator next to the title (see Save Indicator States)
- **Versions button** (right side): opens the version panel
- **Ctrl+S**: wired to immediate save
- **Title click**: inline rename of the schedule (updates both the display name and the filename)

### Schedule Duplication
From the library's context menu, "Duplicate" creates a copy of the schedule:
- Name: "[Original Name] (Copy)"
- Contains the same days, events, notes, and groups
- No versions copied — starts with a clean version history
- Opens immediately in the editor

This supports the month-to-month workflow where drill schedules share similar structures.

---

## 6. User Identity

### Setup
- On first launch (before any save), a lightweight prompt asks: "What's your name?"
- Single text field, pre-focused
- Stored in `localStorage` — per-browser, persists until cleared
- If cleared, the prompt reappears on next save attempt

### Usage
- Every auto-save and manual save tags `lastSavedBy` with this name
- Every named version tags `savedBy` with this name
- Stale-data warnings reference the other user's name

No auth system, no login, no accounts. Just a name for attribution.

---

## 7. Browser Fallback

The File System Access API is only available in Chrome and Edge.

### Detection
On load, check for `window.showDirectoryPicker`. If absent:

### Degraded Mode
- The schedule library still works — schedules are loaded from `scheduledata.js` (legacy) or session storage
- Auto-save is **disabled** — only sessionStorage crash recovery runs
- A persistent but non-intrusive banner at the top of the library: *"Auto-save requires Chrome or Edge. You're in manual mode — use the Save button to download your data."*
- The Save button triggers the existing download-based export (`saveDataFile()` blob download path)
- All other features (editing, printing, versions in memory) work normally — they just don't persist to disk automatically

This ensures the app never breaks, it just loses the auto-save magic.

---

## 8. Migration

### Existing `scheduledata.js`
On first load with the new library system:
1. If `SAVED_STATE` exists (loaded via the `<script>` tag), auto-import it as a schedule in the library
2. The schedule name is pulled from `SAVED_STATE.title`
3. It becomes a regular JSON file in `data/` with the same save/version behavior
4. `scheduledata.js` is left in place (not deleted) for backward compatibility, but is no longer the primary data source

### sessionStorage Recovery
If no directory handle exists and no `SAVED_STATE` is found, check sessionStorage as a last resort — same as current behavior.

### Sample Data
Only loaded if nothing else is found (no directory handle, no `SAVED_STATE`, no sessionStorage). Creates a sample schedule to demonstrate the app.

---

## Data Flow Summary

```
App Load
  ├─ Has directory handle in IndexedDB?
  │   ├─ Yes → scan data/*.json → show library
  │   └─ No → has SAVED_STATE?
  │       ├─ Yes → import as schedule → prompt for folder → show library
  │       └─ No → has sessionStorage?
  │           ├─ Yes → recover → prompt for folder → show library
  │           └─ No → show empty library with + button
  │
User opens a schedule
  └─ Load full JSON → populate Store → render editor
  │
User edits
  ├─ Every mutation → mark dirty (amber dot) → debounce 2s → auto-save to file
  ├─ Ctrl+S → save immediately
  └─ sessionStorage backup runs in parallel
  │
User saves a version
  └─ Snapshot current → append to versions[] → write file
  │
User returns to library
  └─ Re-scan data/*.json for updated metadata → render list
```
