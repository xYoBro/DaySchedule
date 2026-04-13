# DaySchedule

DaySchedule is a browser-based schedule builder designed to run from a shared folder. It is meant for teams that need a simple shared workflow without deploying a traditional web app.

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

DaySchedule remembers that folder connection for the current browser.

## Daily Use

1. Open the same shared DaySchedule copy.
2. Open the schedule you need from the library.
3. If the schedule opens in read-only mode, click `Edit`.
   When you are finished, click `Done Editing` to hand it off clearly.
4. Make your changes.
   `Audience` means the group or section this event belongs to. `Primary` audiences go to the main track automatically. `Supporting` or unassigned events stay out of the main track unless you turn on `Main Track`.
   `Specific People` is only for named exceptions inside that audience.
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

## Recommended Team Rollout

If you are publishing this for a unit or shop, keep the workflow simple:

- Make one shared DaySchedule folder the official team copy.
- Use SharePoint as the source of truth if that is your approved shared location.
- Use Teams as the doorway if that is how your people find the shared copy.
- Pin a short "Start Here" post with the setup steps and screenshots.
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

`Audience` is the group, section, or shop the event belongs to. `Specific People` is only for named exceptions or callouts inside that audience.

### What if I do not see someone else's changes?

First confirm that you opened the shared copy, not a personal one. Then return to the library and reopen the schedule so the app reloads the latest file.

### What if I accidentally worked from a personal copy?

Do not keep editing there. Go back to the shared copy, compare what changed, and move the updates over carefully. If the personal copy contains major changes, save a version or create a duplicate before merging anything into the shared copy.

### What if someone is out of office and the team still needs to update the schedule?

DaySchedule uses a lease-style lock. If someone closes the app or stops refreshing the lock, it expires automatically after a timeout. Once it expires, the next person can open the schedule and click `Edit`.

If the team lead or supervisor needs access sooner, they can use `Take Over` from the read-only banner. That should only be used after confirming that the current editor is unavailable or no longer working in the file.

## Future Improvement

If this project stays on a shared-folder model, the next useful UX improvement would be a small audit trail for lock takeovers so the team can see who overrode the last lock and when.
