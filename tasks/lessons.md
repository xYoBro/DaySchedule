# Reliability release lessons

- A save needs both a captured revision and document identity. A completed write may acknowledge its snapshot; it must not replace later live data. Test paused reads, writes, and closes with edits and navigation in between.
- A durable browser backup is shared across tabs. A newer timestamp or matching workbook ID does not establish that it is the right draft for a tab. Prefer valid tab-local recovery and delete only the exact backup being cleared.
- Protect a version checkpoint in memory and recovery before awaiting its file write. A later version action must carry forward a failed checkpoint after validating the disk baseline.
- DOM print measurements cannot prove pagination or field fidelity. Keep responsive rules screen-only and inspect emitted PDFs with unique content markers. Narrow columns can split words during text extraction, so compare robust markers rather than prose line breaks.
- A modal's opener can be replaced by a rerender, and stacked dialogs need one focus/Escape lifecycle. Restore focus after rerendering, and test keyboard-triggered opening because mouse-focus behavior differs by browser.
