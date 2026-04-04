# Schedule Builder — Design Spec

## Purpose

A tool to build and print multi-day event schedules. Primary use case: Air National Guard drill weekend schedules (2–4 days). Core engine is generic enough for any event-planning context. Replaces Excel-based schedules that are ugly, hard to modify, and don't communicate effectively.

## Tech Stack

- HTML5, CSS3, vanilla JavaScript (no frameworks)
- No build step — files served directly to the browser
- Must work with `file://` URLs as well as `http://`
- Target browsers: Safari, Chrome, Firefox (latest versions)
- Same stack and philosophy as the Org Chart project

## Core Concepts

### Schedule

A schedule is a named collection of days. Example: "April RSD" containing Saturday and Sunday.

- **Title**: free text (e.g., "April RSD", "Super Drill", "Annual Training")
- **Days**: ordered list of day objects, each with a date and time bounds
- **Groups**: the audience taxonomy for this schedule
- **Notes**: managed per day (each day has its own notes list)
- **Logo**: optional square image displayed in the header

### Day

A single day within a schedule.

- **Date**: the calendar date
- **Label**: auto-generated or overridden (e.g., "Day 1 of 2")
- **Time bounds**: start and end of the duty day (e.g., 0700–1630). Configurable per day. Events can extend beyond these bounds.
- **Events**: all events occurring on this day

### Event

A time-bound activity with metadata.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| title | string | yes | Event name |
| startTime | time | yes | 24hr format (e.g., 0730) |
| endTime | time | yes | 24hr format |
| description | string | no | Free text, supports multiple lines |
| location | string | no | Building, room, area |
| poc | string | no | Point of contact |
| group | reference | yes | Which audience group this event targets |
| isMainEvent | boolean | auto | Derived from group scope, user can override |

Events auto-sort chronologically by start time. No manual ordering.

### Audience Group

Predefined entities that events reference. Defined once per schedule, reusable across all events and days.

| Field | Type | Notes |
|-------|------|-------|
| name | string | Display label (e.g., "All Personnel", "A Flight", "Flight Chiefs") |
| scope | enum | `main` or `limited` |
| color | hex | Accent color for the left border on main events |

**Scope determines layout placement:**
- `main` → event appears in the main column. Gets shaded band treatment if tagged as anchor/main event.
- `limited` → event goes to concurrent section if it overlaps with main events, or appears as a supporting band in the main column if it fits in a gap.

**isMainEvent derivation:** defaults to `true` when the group scope is `main`, defaults to `false` when scope is `limited`. User can override either direction via a checkbox in the editing interface.

The group list is fully user-configurable. Add, remove, rename, recolor, change scope at any time.

### Notes

Free-text entries at the bottom of each day's page.

| Field | Type | Notes |
|-------|------|-------|
| category | string | Bold run-in label (e.g., "Medical", "TDY", "Facility") |
| text | string | The note content |

Notes render in a two-column layout. The notes section scales dynamically — when notes are heavy, the print engine compresses event band spacing to keep everything on one page.

## Print Layout — The Band System

Each day prints as a single US Letter page. Orientation is configurable (portrait default, landscape available).

### Page Structure (top to bottom)

1. **Header** — title, date, day label, metadata line, logo (top right, 0.75" square)
2. **Event Bands** — the schedule itself, flowing top to bottom
3. **Section Breaks** — visual dividers between morning/afternoon (placed around breaks like lunch)
4. **Concurrent Events Row** — horizontal row of long-running limited-attendance events
5. **Notes** — two-column list at the bottom
6. **Footer** — contact info, schedule POC, last-updated date

### Event Band Anatomy

Each event is a full-width horizontal band with three zones:

```
┌──────────┬────────────────────────────────┬──────────────────┐
│ TIME     │ CONTENT                        │ ALSO HAPPENING   │
│ 0900     │ AFSC-Specific Training         │ E-7 Promo Board  │
│ 1100     │ Description text...            │ 0800–1100        │
│ 2 HRS    │ Location · POC                 │ Bldg 100         │
│          │ [BY FLIGHT]                    │ BOARD MEMBERS    │
└──────────┴────────────────────────────────┴──────────────────┘
```

- **Time block** (left, ~76px): bold start time, lighter end time, duration label. Separated by a colored vertical border (accent color for main events, gray for supporting).
- **Content** (center, flex): title, description, location/POC, audience tag.
- **"Also happening"** (right, optional): inline concurrent event indicator. Only appears on bands that overlap with limited-scope events.

### Three Visual Tiers

1. **Main events** (anchor): shaded background band (`#eef0f3`), colored left time border (3px), bold title (13.5px/700), filled audience tag. These are the spine of the day.

2. **Supporting events**: white background, gray left time border, lighter title (11px/500), outlined audience tag. Visually subordinate but fully readable.

3. **Breaks** (lunch, travel): muted background (`#f8f8fa`), gray everything, uppercase title. Minimal visual weight.

### Concurrent Events

Events with `limited` scope that overlap with main events appear in two places:

1. **"Also happening" indicator** on the main event band they overlap with (right side of the band)
2. **Concurrent row at bottom** — a horizontal row of cards below the schedule, showing all long-running concurrent events with time, title, location, POC, and audience badge

If a limited-scope event fits entirely within a gap between main events (no overlap), it renders as a supporting band in the main column instead.

### Section Breaks

A thin gradient line placed around breaks (lunch, etc.) to visually divide the day into morning/afternoon sections. Solid dark on the left (aligning with the time column), fading to light gray across the content area.

### Adaptive Print Scaling

The engine must fit each day onto a single page. When content exceeds the page:

1. Reduce event band padding progressively
2. Compress description line-height and metadata spacing
3. Reduce font sizes by 0.5–1px across all tiers
4. Compress concurrent row and notes section

Same adaptive approach as the Org Chart's `LAYOUT_TARGETS` system — define min/max ranges for each dimension and interpolate based on content volume.

## Color System

Three tones for events, not a rainbow:

- **Dark** (`#1d1d1f`) — default time border for supporting events
- **Accent** (per group, e.g., `#2558a8` blue, `#b06a10` amber) — time border for main events, filled audience tags
- **Muted** (`#d2d2d7`) — breaks

Audience group colors are user-configurable. The system provides a default palette but the user can change any group's color.

All designs must print legibly in B&W. Color reinforces; it never carries meaning alone.

## Editing Interface

### Design Principles

The primary user is a low-ranking, inexperienced airman. The interface must be dead simple.

- **Click to edit**: click an event band to open an inline editing panel. Fields become editable inputs.
- **Add event**: persistent "+ Add Event" button. Opens an empty editing panel with time pickers (dropdowns in 15-minute increments), text inputs, and a group dropdown.
- **Delete event**: red text button in the editing panel, requires confirmation.
- **Auto-sort**: events re-sort chronologically after every edit. The user never manually positions anything.
- **No drag-and-drop, no resize handles, no timeline snapping.** Those are power-user patterns that will confuse the target user.

### Group Management

Accessible from a settings/config panel (not the main editing flow):

- Add/remove/rename audience groups
- Set scope (main/limited) per group
- Assign accent color per group
- Changes apply to all events referencing that group

### Schedule Setup

- Title, logo upload
- Add/remove days, set dates and time bounds per day
- Manage the notes list per day

## Data Persistence

Same approach as the Org Chart:

- **Primary**: File System Access API (Chrome/Edge) to write a JS data file
- **Fallback**: download as a file
- **Crash recovery**: sessionStorage
- **Format**: JSON object containing the full schedule state

## Multi-Day Handling

Each day is a separate page. The interface shows tabs or a day selector. Print outputs one page per day. A "Print All" option generates a multi-page PDF with one day per page.

## Reference Mockup

The approved visual direction is captured in:
`.superpowers/brainstorm/32449-1775326319/content/layout-v20-refined.html`

This mockup demonstrates the band layout, main/supporting/break hierarchy, concurrent event placement, header structure, notes section, and the overall typographic system.
