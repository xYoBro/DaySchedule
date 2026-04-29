# DaySchedule

DaySchedule is a browser-based schedule builder designed to run from a shared folder. It is meant for teams that need a simple shared workflow without deploying a traditional web app.

Licensed under the MIT License. See [LICENSE](/Users/adknott/Code/DaySchedule/LICENSE).

## Recommended Setup

Use one shared master copy of the full DaySchedule folder.

- Keep the full app together, including the `app` folder and the schedule storage folder.
- Have everyone open the same shared copy every time.
- If your organization reaches that shared copy through SharePoint, Teams, or another shared location, treat that shared copy as the source of truth.
- Do not email ZIPs around, copy the folder to personal desktops, or let multiple "master" copies exist.

## First-Time Setup

1. Open the shared DaySchedule copy your team uses on your computer.
2. Launch DaySchedule from that shared copy.
3. Click `Connect Shared Folder`.
4. Choose the folder where schedule files live.
   In most DaySchedule copies, this is `app/data`.
5. Confirm that you selected the shared team folder, not a personal or downloaded copy.
6. When prompted for your name, use the real name your team will recognize.

If your team reaches DaySchedule through Microsoft Teams, open the team or channel `Files` tab, click `Sync`, wait for the shared folder to appear on your computer, then open DaySchedule from that synced folder. Sync matters because DaySchedule saves directly into the shared folder. A download creates a separate copy that other people will not see.

DaySchedule remembers that folder connection for the current browser.

## Daily Use

1. Open the same shared DaySchedule copy.
2. Open the schedule you need from the library.
3. If the schedule opens in read-only mode, click `Edit`.
   When you are finished, click `Done Editing` to hand it off clearly.
4. Make your changes.
   `Quick Edit` works like a dense worksheet: one row per event, with a selected-row editor at the bottom for the extra fields.
   Click a row to edit those extra fields, or double-click a row to jump straight into full event details.
   `Audience` means the group or section this event belongs to. `Primary` audiences go to the main track automatically. `Supporting` or unassigned events stay out of the main track unless you turn on `Main Track`.
   `Specific People` is for named people. Use it when an event is only for a few named people, or when a few named people need something different from the main audience.
5. Wait for `Saved` in the toolbar before handing off to the next person.
6. Return to the library when you are done.

## Shared Editing Rules

- One editor at a time per schedule is the safest workflow.
- Existing schedules may open in read-only mode until someone clicks `Edit`.
- Before handing a schedule to someone else, wait for the save indicator to show `Saved`.
- If a lead must unblock a schedule before the current lock expires, they can use `Take Over` after confirming the current editor is unavailable.
- For major updates, use `Versions` first so there is a named checkpoint.
- Never edit from a downloaded, zipped, backup, or personal copy.
- If you are not sure which copy is correct, stop and ask your team lead or admin before editing.

## Browser Guidance

- Use Chrome or Edge for full auto-save support.
- Other browsers can still open the app, but saving falls back to manual `Save to File`.

## Single-File App Shell

Run `python3 tools/build-single-html.py` to create `dist/DaySchedule.html`.
The generated file is only the launchable app shell. Operational schedule data
should stay in `.schedule` files or shared `app/data` JSON files.

## Recommended Team Rollout

If you are publishing this for a unit or shop, keep the workflow simple:

- Make one shared DaySchedule folder the official team copy.
- Use SharePoint as the source of truth if that is your approved shared location.
- Use Teams as the doorway if that is how your people find the shared copy.
- Tell users there is one entry point: open `index.html` from the shared copy, then use the in-app `Start Here` / `Help` button for setup and reminders.
- Tell everyone to keep opening the same shared copy on their computer after the first setup.

The user-facing rule should be simple:

`Open the shared copy. Edit there. Wait for Saved. Hand off.`

## FAQ

### Where should I open DaySchedule from?

Open it from the shared team copy every time. If you reached it through SharePoint or Teams, use that shared copy on your computer instead of downloading a separate copy.

### What folder should I pick when the app asks to connect?

Choose the folder where the schedule files live. In most DaySchedule copies, that is `app/data`. If your team packaged it differently, choose the folder that already contains the saved schedule files.

### Can multiple people edit the same schedule at once?

The recommended workflow is no. Have one person edit at a time per schedule, then hand off after the toolbar shows `Saved`.

### Why did Main Track change when I changed Audience?

That is expected. `Primary` audiences automatically place the event in the main track. `Supporting` or unassigned events stay out of the main track unless you turn on `Main Track` as an override.

### What is the difference between Audience and Specific People?

`Audience` is the group, section, or shop the event belongs to. `Specific People` is for named people, either by themselves or inside that audience.

### What if I do not see someone else's changes?

First confirm that you opened the shared copy, not a personal one. Then return to the library and reopen the schedule so the app reloads the latest file.

### What if I accidentally worked from a personal copy?

Do not keep editing there. Go back to the shared copy, compare what changed, and move the updates over carefully. If the personal copy contains major changes, save a version or create a duplicate before merging anything into the shared copy.

### What if someone is out of office and the team still needs to update the schedule?

DaySchedule uses a lease-style lock. If someone closes the app or stops refreshing the lock, it expires automatically after a timeout. Once it expires, the next person can open the schedule and click `Edit`.

If the team lead or supervisor needs access sooner, they can use `Take Over` from the read-only banner. That should only be used after confirming that the current editor is unavailable or no longer working in the file.

### Can different days use different layouts?

Not currently. Layout is schedule-wide, so switching to Bands, Grid, Cards, or Phases changes the full schedule.

### What should I do on extremely crowded days?

Use `Bands` for the presentation view, then switch to `Grid` or `Cards` to sanity-check crowded overlapping schedules before you hand them off or print them.

## Future Improvement

If this project stays on a shared-folder model, the next useful improvements should come from real-world user testing: where people hesitate, which layouts they switch to on crowded days, and where handoffs still create confusion.
