# Print Test Agent — Design Spec

## Purpose

A two-layer print verification system: a **generic print test agent** (global, reusable across any project) and a **project-specific print test skill** (Schedule Builder stress cases and structural checks). Together they verify that pages print on exactly one page, catch visual regressions via screenshots, and validate content integrity.

## Architecture

### Layer 1: Generic Print Test Agent

**Location:** `~/.claude/agents/print-test.md`

A reusable agent that takes a URL and page configuration, generates a PDF via Playwright's `page.pdf()`, counts pages, takes screenshots, and reports pass/fail. Knows nothing about any specific app — just "does this URL print on N pages?"

**Inputs (passed via the prompt):**
- `url` — the page to test (http:// URL)
- `expectedPages` — how many pages the output should be (default: 1)
- `pageSize` — paper size (default: "Letter")
- `orientation` — portrait or landscape (default: "portrait")
- `pageMargin` — margins matching @page CSS (default: "0.15in")
- `screenshotDir` — where to save screenshots (default: `tests/print-screenshots/`)
- `testCases` — array of `{ name, setupFn }` where setupFn is JS code to run in the page before printing (for loading test data, navigating to specific views, etc.)

**What it does for each test case:**
1. Navigates to the URL
2. Runs `setupFn` via `page.evaluate()` to set up the test state
3. Waits for layout to settle (network idle + requestAnimationFrame)
4. Calls `page.pdf()` with the specified page size, orientation, and margins — this applies `@media print` CSS and produces the actual paginated output
5. Counts pages in the resulting PDF
6. Converts each PDF page to a PNG screenshot, saves to `screenshotDir/{testName}.png`
7. Compares page count to `expectedPages`

**Verdicts per test case:**
- **PASS** — page count matches expected
- **FAIL** — page count does not match expected

**Output:**
- Terminal: one line per test case — checkmark/X + test name + actual vs expected pages
- Screenshots: one PNG per test case saved to the specified directory
- Final summary line: `N passed, N failed out of N total`

**What it does NOT do:**
- No structural/content verification (that's the project layer's job)
- No source code modification
- No print dialog interaction
- No Safari testing (Playwright uses Chromium)

### Layer 2: Schedule Builder Print Test Skill

**Location:** `.claude/skills/print-test/SKILL.md` (project-specific)

A skill that generates Schedule Builder stress test data, invokes the generic print test agent, then runs structural checks against the rendered DOM.

**Invocation:** `/print-test` (user-only)

**What it does:**
1. Starts a local HTTP server serving the project directory
2. Defines test cases with Schedule Builder-specific setup functions:

| Case | Setup | Expected Pages |
|------|-------|----------------|
| **sample** | Calls `loadSampleData()` — the default drill weekend (11 events, 4 concurrent, 7 notes) | 1 |
| **heavy-events** | Generates 22 events: 12 main, 6 supporting, 4 breaks. Full day 0600-1800. | 1 |
| **heavy-notes** | 8 events + 12 notes with 2-line text each. Tests notes overflow. | 1 |
| **many-concurrent** | 6 main events + 8 limited-scope events all overlapping. Tests concurrent row + "Also happening" density. | 1 |
| **minimal** | 1 event, 0 notes. Tests empty-ish schedule. | 1 |
| **multi-day** | 3 days: day 1 heavy, day 2 normal, day 3 minimal. Tests printAllDays. | 3 |

3. Invokes the generic print test agent with the test cases
4. After the agent completes, runs **structural checks** on each test case by navigating to the page, loading the test data, and verifying DOM content:
   - Header present (`.hdr` exists, title not empty)
   - All events rendered (count of `.band` elements matches expected)
   - Notes section present when notes exist (`.notes` element with correct number of `li` items)
   - Concurrent row present when concurrent events exist (`.conc-section` with correct number of `.conc-item` elements)
   - Footer present (`.footer` exists, not empty)
   - No negative durations displayed (no `t-dur` containing "-")

5. Reports combined results:
   - Print test results (from the generic agent)
   - Structural check results (pass/fail per check per test case)
   - Screenshots location

**Stress data generation:**

The setup functions build data programmatically using the app's Store API:
```js
// Example: heavy-events setup
Store.reset();
Store.setTitle('Stress Test — Heavy Events');
const day = Store.addDay({ date: '2026-01-01', startTime: '0600', endTime: '1800' });
// ... generate 22 events with realistic titles, times, groups
```

Each setup function is self-contained JS that runs inside `page.evaluate()`. It calls Store methods directly, then triggers a render.

### File Structure

```
~/.claude/agents/
  print-test.md                    <- generic agent (global, reusable)

<project>/
  .claude/skills/print-test/
    SKILL.md                       <- project-specific skill definition
  tests/
    print-test-data.js             <- stress case data generators (setup functions)
    print-screenshots/             <- output folder (gitignored)
      sample.png
      heavy-events.png
      heavy-notes.png
      many-concurrent.png
      minimal.png
      multi-day-day1.png
      multi-day-day2.png
      multi-day-day3.png
```

## Technical Details

### PDF Generation

Playwright's `page.pdf()` is the authoritative source of truth for print pagination:
- Applies `@media print` CSS rules
- Respects `@page { size, margin }` declarations
- Produces actual paginated output — no height estimation needed
- Returns a Buffer; page count determined by parsing the PDF
- Chromium-only (Playwright's default browser) — acceptable since this is a test tool, not production

### Page Count from PDF

Use Playwright's `page.pdf()` to generate the PDF buffer. Count pages using Playwright's own `page.evaluate()` with the browser's built-in PDF.js (`pdfjsLib.getDocument()`) or by writing the buffer to a temp file and parsing it with `pdfjs-dist` in a Node script invoked via Bash. Raw string matching (`/Type /Page`) is unreliable due to PDF internal structure.

Simplest reliable approach: write the PDF buffer to a temp file, then run a small inline Node script that uses `pdfjs-dist` (or Python's `PyPDF2` / `pikepdf` which are commonly available) to read the page count. Since this is a test tool, a one-line dependency is acceptable.

### Screenshot from PDF

Two options for generating PNGs from PDF pages:
- **Option A:** Use Playwright to navigate to each test case and take a `page.screenshot()` of the rendered page (screen layout, not print layout). Simple but doesn't show print-specific styling.
- **Option B:** Re-render each PDF page as a screenshot. Requires a PDF rendering step.

**Chosen: Option A** — `page.screenshot()` of the rendered page after setup. The PDF is for page-count verification; the screenshot is for visual review of the layout. The screen preview closely matches print output (same CSS, same content), and is simpler to capture.

### Server Lifecycle

The skill starts a local HTTP server (`python3 -m http.server <port>`) on an available port, runs all tests, then kills the server. Port selection: try 8787, fall back to random available port.

### Gitignore

The skill should add `tests/print-screenshots/` to `.gitignore` if not already present. Screenshots are ephemeral test output, not source code.

## Constraints

- The generic agent must not import or depend on any project-specific code
- The generic agent communicates with the project skill through its prompt interface (test case definitions, URLs, configuration)
- The skill must clean up after itself (kill the HTTP server)
- Screenshots overwrite previous runs (no timestamp accumulation)
- Playwright MCP must be available (the agent should check and report if it's not)

## Out of Scope

- Safari/Firefox print testing (Playwright limitation)
- Testing with real user-saved data (non-deterministic)
- Auto-triggering on file changes (on-demand only, per user preference)
- Visual diff comparison between runs (future enhancement)
- Print dialog interaction (PDF generation bypasses the dialog)
