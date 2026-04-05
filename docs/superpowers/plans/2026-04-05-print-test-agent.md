# Print Test Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-layer print verification system — a reusable generic print test agent and a Schedule Builder-specific print test skill — that uses Playwright PDF generation to verify pages print correctly.

**Architecture:** Layer 1 is a global agent (`~/.claude/agents/print-test.md`) that takes a URL + test cases, generates PDFs via Playwright, counts pages, takes screenshots, and reports pass/fail. Layer 2 is a project skill (`.claude/skills/print-test/SKILL.md`) that generates Schedule Builder stress data, invokes the agent, and runs DOM structural checks. The agent communicates with Playwright via the MCP tools already installed.

**Tech Stack:** Playwright MCP (browser automation), Python 3 (PDF page counting), Bash (server lifecycle)

**Reference spec:** `docs/superpowers/specs/2026-04-05-print-test-agent-design.md`

---

## File Structure

```
~/.claude/agents/
  print-test.md                         <- generic print test agent (global)

/Users/adknott/Desktop/Schedule/
  .claude/skills/print-test/
    SKILL.md                            <- project-specific skill
  tests/
    print-test-data.js                  <- stress case setup functions (loaded by the skill)
    print-screenshots/                  <- output (gitignored)
```

---

### Task 1: Generic Print Test Agent

**Files:**
- Create: `~/.claude/agents/print-test.md`

This is the reusable global agent. It receives test configuration via its prompt, uses Playwright MCP tools to navigate, generate PDFs, count pages, and take screenshots.

- [ ] **Step 1: Create the agent file**

```markdown
---
name: print-test
description: Verify pages print on the expected number of pages using Playwright PDF generation. Takes a URL, test cases with setup functions, and page configuration. Reports pass/fail with screenshots.
tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - mcp__plugin_playwright_playwright__browser_navigate
  - mcp__plugin_playwright_playwright__browser_evaluate
  - mcp__plugin_playwright_playwright__browser_take_screenshot
  - mcp__plugin_playwright_playwright__browser_run_code
  - mcp__plugin_playwright_playwright__browser_wait_for
  - mcp__plugin_playwright_playwright__browser_close
---

# Print Test Agent

You are a print layout verification agent. You test whether web pages print on the expected number of pages.

## Inputs

You will be given:
- **url**: The HTTP URL to test
- **screenshotDir**: Directory to save screenshots (create if needed)
- **testCases**: A list of test cases, each with:
  - `name`: Test case identifier (used for screenshot filenames)
  - `setupFn`: JavaScript code to run in the page before printing (loads test data, navigates views, etc.)
  - `expectedPages`: How many printed pages this should produce (default: 1)
- **pageConfig** (optional): `{ width, height, marginTop, marginBottom, marginLeft, marginRight }` matching the app's @page CSS. Defaults to US Letter portrait with 0.15in margins.

## Execution

For each test case, do the following in order:

### 1. Navigate
Use `browser_navigate` to load the URL.

### 2. Setup
Use `browser_evaluate` to run the test case's `setupFn` code. This sets up the page state (loads data, triggers renders, etc.).

### 3. Wait for layout
Use `browser_evaluate` to run:
```js
() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
```
This ensures layout is complete after the setup function ran.

### 4. Take screenshot
Use `browser_take_screenshot` to capture the rendered page. Save to `{screenshotDir}/{name}.png`.

### 5. Generate PDF and count pages
Use `browser_run_code` to generate a PDF and write it to a temp file:

```javascript
async (page) => {
  const pdf = await page.pdf({
    format: 'Letter',
    margin: { top: '0.15in', bottom: '0.15in', left: '0.15in', right: '0.15in' },
    printBackground: true,
  });
  const fs = require('fs');
  const path = '/tmp/print-test-output.pdf';
  fs.writeFileSync(path, pdf);
  return { path, bytes: pdf.length };
}
```

Then use Bash to count pages in the PDF:

```bash
python3 -c "
import re, sys
with open('/tmp/print-test-output.pdf', 'rb') as f:
    data = f.read().decode('latin-1')
# Find /Type /Pages (page tree root) and extract /Count N
m = re.search(r'/Type\s*/Pages\b[^>]*/Count\s+(\d+)', data)
print(m.group(1) if m else 'ERROR')
"
```

### 6. Compare
Compare the page count to `expectedPages`. Record PASS or FAIL.

### 7. Clean up
Delete `/tmp/print-test-output.pdf`.

## Reporting

After all test cases complete, output a summary:

```
Print Test Results
──────────────────
✓ sample              1/1 pages
✓ heavy-events        1/1 pages
✗ heavy-notes         2/1 pages  ← FAIL
✓ minimal             1/1 pages

Screenshots saved to: tests/print-screenshots/

3 passed, 1 failed out of 4 total
```

If ALL pass, end with: `All print tests passed.`
If ANY fail, end with: `PRINT TEST FAILURES DETECTED. Check screenshots for visual review.`

## Rules
- Do NOT modify any source files
- Do NOT open a print dialog (use page.pdf() only)
- Do NOT install any dependencies
- If Playwright MCP tools are not available, report the error and stop
- Overwrite screenshots from previous runs (no timestamp accumulation)
- Process test cases sequentially (one at a time)
```

Write this to `~/.claude/agents/print-test.md`.

- [ ] **Step 2: Verify the agent file is readable**

Run: `cat ~/.claude/agents/print-test.md | head -5`
Expected: Shows the frontmatter header.

- [ ] **Step 3: Commit**

```bash
# This is a global file, not in the project repo — no git commit needed.
```

---

### Task 2: Stress Test Data Generators

**Files:**
- Create: `tests/print-test-data.js`

These are JavaScript setup functions that run inside `page.evaluate()`. Each function calls the Schedule Builder's Store API to build a specific test scenario, then triggers a render.

- [ ] **Step 1: Create the stress test data file**

```js
// tests/print-test-data.js
// Stress case setup functions for print testing.
// Each function is self-contained JS that runs inside page.evaluate().
// It calls Store methods directly, then triggers renderActiveDay().

const PRINT_TEST_CASES = [
  {
    name: 'sample',
    expectedPages: 1,
    setupFn: `
      loadSampleData();
      Store.setActiveDay(Store.getDays()[0].id);
      renderActiveDay();
    `,
  },
  {
    name: 'heavy-events',
    expectedPages: 1,
    setupFn: `
      Store.reset();
      Store.setTitle('Stress Test — Heavy Events');
      Store.setFooter({ contact: 'Test Wing · Uniform: UOD', poc: 'Test POC' });
      const day = Store.addDay({ date: '2026-01-01', startTime: '0600', endTime: '1800' });
      const d = day.id;
      Store.setActiveDay(d);

      // 12 main events across the day
      const mainTimes = [
        ['0600','0700'], ['0700','0800'], ['0800','0900'], ['0900','1000'],
        ['1000','1100'], ['1100','1200'], ['1200','1300'], ['1300','1400'],
        ['1400','1500'], ['1500','1600'], ['1600','1700'], ['1700','1800'],
      ];
      const mainTitles = [
        'Morning Formation', 'Safety Briefing', 'Commander\\'s Call', 'Mission Brief',
        'Skills Training', 'Weapons Qualification', 'Lunch', 'CBRN Training',
        'Physical Readiness', 'Equipment Inspection', 'After Action Review', 'End of Day',
      ];
      mainTimes.forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: mainTitles[i],
          startTime: s, endTime: e,
          description: i % 2 === 0 ? 'Detailed description for this event block.' : '',
          location: 'Bldg ' + (100 + i), poc: 'POC ' + (i + 1),
          groupId: 'grp_all',
          isMainEvent: mainTitles[i] !== 'Lunch',
          isBreak: mainTitles[i] === 'Lunch',
        });
      });

      // 6 supporting events
      const supTimes = [['0630','0700'],['0830','0900'],['1030','1100'],['1330','1400'],['1530','1600'],['1730','1800']];
      supTimes.forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: 'Flight Detail ' + (i + 1),
          startTime: s, endTime: e,
          location: 'Area ' + (i + 1), poc: 'Flight CC',
          groupId: 'grp_flight', isMainEvent: false,
        });
      });

      // 4 breaks
      [['0555','0600'],['1155','1200'],['1355','1400'],['1755','1800']].forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: ['Travel','Lunch Break','Transition','Closeout'][i],
          startTime: s, endTime: e,
          groupId: 'grp_all', isMainEvent: true, isBreak: true,
        });
      });

      // 3 notes
      Store.addNote(d, { category: 'Admin', text: 'Sign in at CSS by 0545.' });
      Store.addNote(d, { category: 'Medical', text: 'Sick call 0600-0700 at clinic.' });
      Store.addNote(d, { category: 'Uniform', text: 'ABUs all day. PT gear for Physical Readiness block.' });

      renderActiveDay();
    `,
  },
  {
    name: 'heavy-notes',
    expectedPages: 1,
    setupFn: `
      Store.reset();
      Store.setTitle('Stress Test — Heavy Notes');
      Store.setFooter({ contact: 'Test Wing', poc: 'Test POC' });
      const day = Store.addDay({ date: '2026-01-02', startTime: '0700', endTime: '1630' });
      const d = day.id;
      Store.setActiveDay(d);

      // 8 normal events
      const times = [['0700','0800'],['0800','0900'],['0900','1000'],['1000','1100'],['1100','1200'],['1200','1300'],['1300','1400'],['1400','1500']];
      const titles = ['Formation','Briefing','Training Block 1','Training Block 2','Lunch','Training Block 3','Debrief','Dismissal'];
      times.forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: titles[i], startTime: s, endTime: e,
          description: 'Standard event description.',
          location: 'Bldg 200', poc: 'POC',
          groupId: 'grp_all', isMainEvent: true,
          isBreak: titles[i] === 'Lunch',
        });
      });

      // 12 notes with long-ish text
      const cats = ['Medical','TDY','Facility','Uniform','Visitors','Vehicle','Dining','Safety','Admin','Personnel','Equipment','Comms'];
      cats.forEach((cat, i) => {
        Store.addNote(d, {
          category: cat,
          text: 'Note detail line for ' + cat.toLowerCase() + ' operations. Contact section lead for questions. Ref: Policy ' + (100 + i) + '.',
        });
      });

      renderActiveDay();
    `,
  },
  {
    name: 'many-concurrent',
    expectedPages: 1,
    setupFn: `
      Store.reset();
      Store.setTitle('Stress Test — Many Concurrent');
      Store.setFooter({ contact: 'Test Wing', poc: 'Test POC' });
      const day = Store.addDay({ date: '2026-01-03', startTime: '0700', endTime: '1630' });
      const d = day.id;
      Store.setActiveDay(d);

      // 6 main events
      [['0700','0800'],['0800','0930'],['0930','1100'],['1100','1200'],['1200','1400'],['1400','1630']].forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: ['Formation','Block 1','Block 2','Lunch','Block 3','Closeout'][i],
          startTime: s, endTime: e,
          description: i === 0 ? 'Accountability and announcements.' : '',
          location: 'Main Area', poc: 'OIC',
          groupId: 'grp_all', isMainEvent: true,
          isBreak: i === 3,
        });
      });

      // 8 limited-scope concurrent events overlapping main events
      const concTitles = ['Promo Board','Medical Evals','IG Prep','TCCC Cert','Weapons Draw','Intel Brief','Awards Board','Flight Chief Sync'];
      const concTimes = [['0730','1100'],['0800','1000'],['0900','1200'],['1200','1600'],['1300','1500'],['1400','1600'],['0700','0900'],['1500','1630']];
      concTimes.forEach(([s, e], i) => {
        Store.addEvent(d, {
          title: concTitles[i], startTime: s, endTime: e,
          description: 'Concurrent event detail.',
          location: 'Bldg ' + (300 + i), poc: 'Lead ' + (i + 1),
          groupId: 'grp_chiefs', isMainEvent: false,
        });
      });

      Store.addNote(d, { category: 'Admin', text: 'All concurrent events require prior coordination with CSS.' });

      renderActiveDay();
    `,
  },
  {
    name: 'minimal',
    expectedPages: 1,
    setupFn: `
      Store.reset();
      Store.setTitle('Minimal Schedule');
      Store.setFooter({ contact: 'Test Wing', poc: 'Test POC' });
      const day = Store.addDay({ date: '2026-01-04', startTime: '0800', endTime: '0900' });
      Store.setActiveDay(day.id);
      Store.addEvent(day.id, {
        title: 'Single Event',
        startTime: '0800', endTime: '0900',
        description: 'The only event.',
        location: 'Room 1', poc: 'OIC',
        groupId: 'grp_all', isMainEvent: true,
      });
      renderActiveDay();
    `,
  },
  {
    name: 'multi-day',
    expectedPages: 3,
    setupFn: `
      Store.reset();
      Store.setTitle('Multi-Day Stress');
      Store.setFooter({ contact: 'Test Wing', poc: 'Test POC' });

      // Day 1: heavy
      const d1 = Store.addDay({ date: '2026-02-01', startTime: '0600', endTime: '1800' });
      for (let i = 0; i < 10; i++) {
        const h = 6 + i;
        Store.addEvent(d1.id, {
          title: 'Event ' + (i + 1), startTime: String(h).padStart(2,'0') + '00', endTime: String(h + 1).padStart(2,'0') + '00',
          description: 'Description for event ' + (i + 1) + '.',
          location: 'Loc ' + i, poc: 'POC ' + i,
          groupId: 'grp_all', isMainEvent: true,
        });
      }
      for (let i = 0; i < 5; i++) {
        Store.addNote(d1.id, { category: 'Cat ' + i, text: 'Note text for category ' + i + '.' });
      }

      // Day 2: normal
      const d2 = Store.addDay({ date: '2026-02-02', startTime: '0700', endTime: '1630' });
      for (let i = 0; i < 5; i++) {
        const h = 7 + i * 2;
        Store.addEvent(d2.id, {
          title: 'Day 2 Event ' + (i + 1), startTime: String(h).padStart(2,'0') + '00', endTime: String(h + 2).padStart(2,'0') + '00',
          location: 'Area', poc: 'Lead',
          groupId: 'grp_all', isMainEvent: true,
        });
      }

      // Day 3: minimal
      const d3 = Store.addDay({ date: '2026-02-03', startTime: '0800', endTime: '1200' });
      Store.addEvent(d3.id, {
        title: 'Outbrief', startTime: '0800', endTime: '1000',
        groupId: 'grp_all', isMainEvent: true,
      });

      Store.setActiveDay(d1.id);
      renderActiveDay();
    `,
  },
];
```

Write this to `tests/print-test-data.js`.

- [ ] **Step 2: Verify the file is valid JS syntax**

Run: `node --check tests/print-test-data.js`
Expected: No output (syntax OK). Note: `PRINT_TEST_CASES` references functions like `loadSampleData`, `Store`, `renderActiveDay` that only exist in the browser context — the syntax check just validates JS structure.

- [ ] **Step 3: Commit**

```bash
git add tests/print-test-data.js
git commit -m "feat: add print test stress case data generators"
```

---

### Task 3: Project-Specific Print Test Skill

**Files:**
- Create: `.claude/skills/print-test/SKILL.md`

The skill that ties everything together. When invoked with `/print-test`, it starts a server, defines the test cases, dispatches the generic agent, runs structural checks, and reports results.

- [ ] **Step 1: Create the skill directory and file**

```bash
mkdir -p .claude/skills/print-test
```

```markdown
---
name: print-test
description: Run print layout verification tests for the Schedule Builder. Generates PDFs via Playwright, checks page counts, takes screenshots, and validates DOM structure.
disable-model-invocation: true
---

# Print Test — Schedule Builder

Run print layout tests to verify every schedule day prints on exactly one page.

## Prerequisites
- Playwright MCP tools must be available
- Python 3 must be installed (for PDF page counting)

## Steps

### 1. Start HTTP server

Start a local server in the project directory:

```bash
cd /Users/adknott/Desktop/Schedule
python3 -m http.server 8787 &
SERVER_PID=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/index.html
```

If the server fails to start (port in use), try port 8788, then 8789.

### 2. Ensure screenshot directory exists

```bash
mkdir -p tests/print-screenshots
```

Also add to .gitignore if not already present:

```bash
grep -q 'tests/print-screenshots' .gitignore || echo 'tests/print-screenshots/' >> .gitignore
```

### 3. Read test case definitions

Read the test cases from `tests/print-test-data.js`. This file defines `PRINT_TEST_CASES` — an array of `{ name, expectedPages, setupFn }` objects.

### 4. Dispatch the generic print test agent

Use the Agent tool to invoke `print-test` (the global agent at `~/.claude/agents/print-test.md`) with:

- **url**: `http://localhost:8787/index.html`
- **screenshotDir**: `tests/print-screenshots/`
- **testCases**: The `PRINT_TEST_CASES` array from step 3

The multi-day test case is special: its `expectedPages` is 3 (one per day). For that case, the setupFn loads multi-day data. The agent should use `printAllDays()` flow for that case (the setupFn handles this by calling the right render function).

Wait for the agent to complete and capture its results.

### 5. Run structural checks

For each non-multi-day test case, navigate to the URL, run the setupFn again, then verify DOM structure using `browser_evaluate`:

```javascript
() => {
  const checks = {};
  // Header
  const hdr = document.querySelector('.hdr');
  checks.headerPresent = !!hdr;
  checks.titleNotEmpty = hdr ? hdr.querySelector('.hdr-title')?.textContent.trim().length > 0 : false;

  // Events
  checks.bandCount = document.querySelectorAll('.band[data-event-id]').length;

  // Notes
  const notes = document.querySelector('.notes');
  checks.notesPresent = !!notes;
  checks.noteCount = notes ? notes.querySelectorAll('.notes-list li').length : 0;

  // Concurrent
  const conc = document.querySelector('.conc-section');
  checks.concurrentPresent = !!conc;
  checks.concurrentCount = conc ? conc.querySelectorAll('.conc-item').length : 0;

  // Footer
  const footer = document.querySelector('.footer');
  checks.footerPresent = !!footer;
  checks.footerNotEmpty = footer ? footer.textContent.trim().length > 0 : false;

  // No negative durations
  const durs = Array.from(document.querySelectorAll('.t-dur'));
  checks.noNegativeDurations = durs.every(d => !d.textContent.includes('-'));

  return checks;
}
```

Compare results against expected values per test case:

| Case | Expected bands | Expected notes | Concurrent expected |
|------|---------------|----------------|-------------------|
| sample | 15 | 7 | yes (4 items) |
| heavy-events | 22 | 3 | no |
| heavy-notes | 8 | 12 | no |
| many-concurrent | 6 | 1 | yes (8 items) |
| minimal | 1 | 0 | no |

### 6. Report results

Output a combined report:

```
Schedule Builder Print Test Results
════════════════════════════════════

Print Layout (PDF page count)
─────────────────────────────
✓ sample              1/1 pages
✓ heavy-events        1/1 pages
✓ heavy-notes         1/1 pages
✓ many-concurrent     1/1 pages
✓ minimal             1/1 pages
✓ multi-day           3/3 pages

Structural Checks
─────────────────
✓ sample           header ✓  bands:15 ✓  notes:7 ✓  concurrent:4 ✓  footer ✓  durations ✓
✓ heavy-events     header ✓  bands:22 ✓  notes:3 ✓  concurrent:0 ✓  footer ✓  durations ✓
✓ heavy-notes      header ✓  bands:8 ✓   notes:12 ✓ concurrent:0 ✓  footer ✓  durations ✓
✓ many-concurrent  header ✓  bands:6 ✓   notes:1 ✓  concurrent:8 ✓  footer ✓  durations ✓
✓ minimal          header ✓  bands:1 ✓   notes:0 ✓  concurrent:0 ✓  footer ✓  durations ✓

Screenshots: tests/print-screenshots/

All tests passed.
```

### 7. Clean up

Kill the HTTP server:

```bash
kill $SERVER_PID 2>/dev/null
# Or if PID was lost:
lsof -ti:8787 | xargs kill 2>/dev/null
```

Close the Playwright browser.
```

Write this to `.claude/skills/print-test/SKILL.md`.

- [ ] **Step 2: Verify the skill file exists and is readable**

Run: `cat .claude/skills/print-test/SKILL.md | head -5`
Expected: Shows the frontmatter header.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/print-test/SKILL.md
git commit -m "feat: add print-test skill for Schedule Builder print verification"
```

---

### Task 4: Gitignore and Final Wiring

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add screenshot directory to gitignore**

```bash
grep -q 'tests/print-screenshots' .gitignore || echo 'tests/print-screenshots/' >> .gitignore
```

- [ ] **Step 2: Create the screenshot directory**

```bash
mkdir -p tests/print-screenshots
```

- [ ] **Step 3: Verify the full setup**

Check all files exist:
```bash
ls -la ~/.claude/agents/print-test.md
ls -la .claude/skills/print-test/SKILL.md
ls -la tests/print-test-data.js
ls -d tests/print-screenshots
grep 'print-screenshots' .gitignore
```

Expected: All files exist, gitignore entry present.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore print test screenshots"
```

---

### Task 5: Smoke Test

**Files:** None (read-only verification)

- [ ] **Step 1: Run the print test skill**

Invoke `/print-test` to run the full test suite. This will:
1. Start the HTTP server
2. Run all 6 test cases through the generic agent
3. Run structural checks
4. Report results
5. Clean up

- [ ] **Step 2: Review results**

Check:
- All 6 test cases report page counts
- Screenshots exist in `tests/print-screenshots/`
- Structural checks pass
- Server is cleaned up (port 8787 free)

```bash
ls -la tests/print-screenshots/
lsof -ti:8787  # Should return nothing
```

- [ ] **Step 3: Fix any issues found during smoke test**

If any test case fails, diagnose whether it's a test data issue, a scaling issue, or an agent issue. Fix the specific problem.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: print test adjustments from smoke test"
```
