#!/usr/bin/env python3
"""Build a SharePoint Embed / Script Editor web part version of DaySchedule
at dist/DaySchedule.sharepoint.html, from the already-built dist/DaySchedule.html.

Run tools/build-single-html.py first (or via this script's --build-dist flag)
so this transforms the current source, not a stale dist copy.

The standalone app assumes it owns the whole page: full-viewport height, a CSP
<meta> tag, and a few places that write directly to document.body/<html>. None
of that holds once the app is pasted into an existing page's widget zone, so
this script:
  - wraps the app in a div#dayschedule-embed-root and scopes its CSS under
    that id via @scope, so component rules can't leak onto the host page
  - retargets the three rules that owned the whole page (the `*` reset,
    `body`'s layout rule, and @media print's `body` rule) to the wrapper
    instead, using :where() for the reset specifically -- see the
    SPECIFICITY NOTE below, this is not optional
  - redirects the app's few direct document.body / document.documentElement
    writes (print container, context menu, theme attribute, --ui-scale) to
    the wrapper
  - drops the CSP <meta> tag (it doesn't apply once pasted into an existing
    page -- see the header comment this script writes into the output)
  - wraps the whole script in the host's preferred IIFE, with a re-entry
    guard for host pages that re-run embedded scripts without a full reload

SPECIFICITY NOTE: the reset rule must be
  :where(#dayschedule-embed-root, #dayschedule-embed-root *) { ... }
and NOT the ID-selector form `#dayschedule-embed-root, #dayschedule-embed-root *`.
An ID-based descendant selector has enough specificity to beat every
class-based margin/padding rule in the app's stylesheet, silently collapsing
padding and spacing everywhere with no console error -- caught only by
checking real computed layout in a browser, not by reading the CSS. :where()
keeps the scoping while contributing zero specificity, matching the original
bare `* {}` reset. If you ever touch this rule, keep it inside :where().

Verify any change to this script's output with tools/sharepoint-host-check.html
(a host page with its own conflicting styles) -- confirm both that the host
page is untouched AND that the widget's own cards/bars still have their real
padding and margins, not just "no console errors."
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
SOURCE = DIST / "DaySchedule.html"
OUTPUT = DIST / "DaySchedule.sharepoint.html"

WRAPPER_ID = "dayschedule-embed-root"

STYLE_RE = re.compile(r"<style>\n(.*?)\n</style>", re.DOTALL)
SCRIPT_RE = re.compile(r"<script>\n(.*?)\n</script>", re.DOTALL)
BODY_RE = re.compile(r"<body>\n(.*?)\n\s*<script>", re.DOTALL)

ROOT_END_MARKER = "\n}\n\n/* ── Reset ── */"

RESET_RULE = "* { margin: 0; padding: 0; box-sizing: border-box; }"
RESET_RULE_NEW = (
    f":where(#{WRAPPER_ID}, #{WRAPPER_ID} *) "
    "{ margin: 0; padding: 0; box-sizing: border-box; }"
)

BODY_BLOCK = """body {
  font-family: 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', 'Helvetica Neue', sans-serif;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  height: 100vh;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}"""
BODY_BLOCK_NEW = f"""#{WRAPPER_ID} {{
  /* Standalone app owned the whole viewport (100vh); embedded in a host
     page's zone it should not commandeer the page. Tune this one value to
     fit your zone -- FIRST THING TO TUNE if the widget looks clipped or
     leaves extra blank space. */
  --dayschedule-embed-height: 900px;
  font-family: 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', 'Helvetica Neue', sans-serif;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  height: var(--dayschedule-embed-height);
  min-height: var(--dayschedule-embed-height);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}}"""

PRINT_BODY_LINE = "  body { background: white; padding: 0; display: block; overflow: visible; }"
PRINT_BODY_LINE_NEW = f"  #{WRAPPER_ID} {{ background: white; padding: 0; display: block; overflow: visible; }}"

# (source string, replacement) -- each must appear exactly once in the
# concatenated script. Fails loudly (like the CSP check in
# build-single-html.py) rather than silently skipping a stale replacement.
JS_REDIRECTS = [
    ("document.body.appendChild(printContainer);", "DS_ROOT.appendChild(printContainer);"),
    ("document.body.appendChild(menu);", "DS_ROOT.appendChild(menu);"),
    ("const root = document.documentElement;", "const root = DS_ROOT;"),
    ("document.body.setAttribute('data-editor-theme', t);", "DS_ROOT.setAttribute('data-editor-theme', t);"),
    ("document.body.classList.toggle('editor-readonly', !editable);", "DS_ROOT.classList.toggle('editor-readonly', !editable);"),
    ("document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3));", "DS_ROOT.style.setProperty('--ui-scale', scale.toFixed(3));"),
]

HEADER_COMMENT = """<!--
  DaySchedule -- SharePoint embed build
  Generated by tools/build-sharepoint-embed.py from dist/DaySchedule.html.
  Do not hand-edit the transformed <style>/<script> content -- re-run the
  script after changing app source or dist/DaySchedule.html. Header comment
  content itself is safe to edit (it's not read back by the script).

  What changed vs. the standalone app, and why (all required for embedding
  correctly into an existing page rather than owning the whole document):

  1. CSS is scoped under #dayschedule-embed-root via @scope so component
     rules (.toolbar, .modal, etc.) cannot leak onto the rest of the host
     page. :root {} is left global/unscoped -- it only declares default
     custom-property values (--sch-*, --chrome-*, --app-accent, --ui-scale),
     which is harmless, and @scope can't usefully scope :root anyway (:root
     always means <html>).
     REQUIRES CSS @scope support (Chrome/Edge 118+, Firefox 128+, Safari
     17.4+): an older engine drops the whole @scope block and the widget
     renders unstyled. Verify the target browsers before rolling out.
  2. The three rules that owned the whole page (`* {...}` reset, `body {...}`
     layout, and `body {...}` inside @media print) now target
     #dayschedule-embed-root instead, and live OUTSIDE the @scope block:
     @scope's implicit matching does not include the scope root itself for a
     bare selector, only genuine descendants, so a rule meant to style the
     root has to sit outside @scope.
       SPECIFICITY NOTE: the reset rule is written as
       `:where(#dayschedule-embed-root, #dayschedule-embed-root *) { margin:0; padding:0; box-sizing:border-box; }`
       -- NOT a plain `#dayschedule-embed-root *` selector. An ID-based
       descendant selector has far higher specificity than the original bare
       `* {}` reset, high enough to beat every class-based margin/padding
       rule in the entire stylesheet, silently collapsing padding and
       spacing everywhere (cards, bars, buttons). This was caught by testing
       computed layout in a browser, not by reading the CSS -- there were no
       console errors, just collapsed spacing. :where() zeroes the
       specificity contribution back out. tools/build-sharepoint-embed.py
       enforces this form; don't "simplify" it by hand.
  3. The app's own document.body is now available as
     `document.getElementById('dayschedule-embed-root')` -- to be a
     well-behaved sub-widget instead of a page owner:
       - print.js: the hidden #printContainer element (used by Ctrl/Cmd+P
         and the Print button) is appended to the wrapper, not
         document.body, so its (now-scoped) CSS actually reaches it.
       - library.js: the schedule-list right-click context menu is appended
         to the wrapper for the same reason.
       - themes.js: the schedule color palette custom properties, and the
         light/dark editor-theme attribute, are set on the wrapper instead
         of <html>/<body> -- otherwise every embed of this widget on a page
         would fight over the same page-level attribute/properties.
       - storage.js: the read-only-mode class toggle targets the wrapper
         (this class currently has no matching CSS rule either way --
         carried over for parity/future-proofing).
       - ui-core.js: the responsive --ui-scale custom property is set on
         the wrapper instead of <html>.
  4. A tiny re-entry guard at the top of the script no-ops a second run of
     this block on the same page (some host pages re-execute embedded
     scripts on client-side navigation without a full reload; without this
     guard that would double-register every global event listener the app
     installs on `document`/`window`).
  5. Everything inside the <script> block runs in ONE shared function scope
     (the IIFE), same as the standalone app's shared global scope --
     cross-references between the app's ~20 source files still resolve
     normally. One consequence: nothing inside is reachable from outside
     this script block (e.g. `window.getAppErrorLog` won't resolve) --
     harmless for the app itself, but worth knowing if you go looking for
     one of its functions from the page's dev console.
  6. init.js wraps each top-level boot step (wireToolbar, wireLibrary,
     wireWorkbookUi, applyEditorTheme) in a try/catch (runBootStep, see
     app/js/init.js) that logs and continues instead of aborting the rest of
     boot. This isolation lives in the SOURCE app (not added by this script)
     because a hosting page can deny things the standalone app never has to
     think about -- e.g. partitioned/blocked storage access for embedded
     content -- and one such failure must not silently leave every other,
     unrelated button unwired with no visible error. If buttons stop
     responding after pasting this into a real page, check this file's
     local error log (Help -> Shortcuts, bottom of the panel) or the
     browser console for "Boot step failed: <name>" before assuming the
     whole script didn't run.

  Verify any future change with tools/sharepoint-host-check.html (a
  simulated host page with its own conflicting margin/background/font) --
  confirm BOTH that the host page is untouched AND that the widget's own
  spacing/padding survived, not just "did it throw an error."

  Known limitations of this port (not fixed here -- flagged, not silently
  papered over):
  - Do not place this widget twice on the same page. It uses ~100 fixed
    element ids (toast, saveIndicator, helpModal, printContainer, ...) that
    are only unique once; a second copy would collide with the first and
    break both instances. This was not rewritten to be multi-instance-safe.
  - Global keyboard shortcuts (Ctrl/Cmd+S/P/Z/Y) are captured on `document`,
    the same as the standalone app -- they fire from anywhere on the page
    the widget is loaded on, not only while the widget has focus.
  - The zero-egress Content-Security-Policy <meta> tag from the standalone
    app is NOT included: CSP meta tags only take effect when present in the
    document's initial <head> at parse time, which doesn't apply to widget
    content pasted into an existing page. The app still makes no network
    calls (nothing changed in the app code itself) -- but that guarantee is
    no longer technically enforced by the browser in this context. If your
    hosting page/tenant has its own CSP, that one governs instead.
  - File System Access API (the file-picker save/open flow) requires a
    same-origin, non-sandboxed context. If the host page renders this web
    part inside a sandboxed iframe, the picker may silently fail to appear
    and the app will fall back to its already-built-in download-based save
    (same fallback Safari/Firefox use).
  - Printing (Ctrl/Cmd+P or the in-app Print button) will still print the
    rest of the host page's chrome alongside the schedule pages; the app has
    no way to hide content it doesn't own.
-->
"""


def read_text(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(
            f"Cannot find {path}. Run tools/build-single-html.py first."
        )
    return path.read_text(encoding="utf-8")


def extract(html: str) -> tuple[str, str, str]:
    style_match = STYLE_RE.search(html)
    body_match = BODY_RE.search(html)
    if not style_match or not body_match:
        raise ValueError("Could not locate <style> or <body> content in dist/DaySchedule.html.")
    style = style_match.group(1)
    body = body_match.group(1)
    scripts = SCRIPT_RE.findall(html)
    if not scripts:
        raise ValueError("No <script> blocks found in dist/DaySchedule.html.")
    return style, body, "\n".join(scripts)


def transform_css(style: str) -> str:
    root_end = style.index(ROOT_END_MARKER) + len("\n}")
    root_block = style[:root_end]
    rest = style[root_end:]

    if rest.count(RESET_RULE) != 1:
        raise ValueError(f"Expected exactly 1 occurrence of the reset rule, found {rest.count(RESET_RULE)}.")
    rest = rest.replace(RESET_RULE, RESET_RULE_NEW)

    if rest.count(BODY_BLOCK) != 1:
        raise ValueError(f"Expected exactly 1 occurrence of the body layout rule, found {rest.count(BODY_BLOCK)}.")
    rest = rest.replace(BODY_BLOCK, BODY_BLOCK_NEW)

    if rest.count(PRINT_BODY_LINE) != 1:
        raise ValueError(f"Expected exactly 1 occurrence of the print body rule, found {rest.count(PRINT_BODY_LINE)}.")
    rest = rest.replace(PRINT_BODY_LINE, PRINT_BODY_LINE_NEW)

    # Pull the three root-self-targeting rules out of @scope: @scope's
    # implicit matching does not include the scope root itself for a bare
    # selector (verified empirically), only genuine descendants.
    rest = rest.replace(RESET_RULE_NEW + "\n\n", "")
    rest = rest.replace(BODY_BLOCK_NEW + "\n\n", "")
    print_media_marker = "\n" + PRINT_BODY_LINE_NEW + "\n"
    if rest.count(print_media_marker) != 1:
        raise ValueError("Could not isolate the print body rule inside @media print.")
    rest = rest.replace(print_media_marker, "\n")

    # The bare `[data-editor-theme="dark"] { --chrome-*: … }` rule styles the
    # element carrying the attribute — now the wrapper itself — and @scope
    # does not match the scope root for a bare selector (the same reason the
    # three wrapper rules above live outside). Verified: with it inside @scope
    # the dark theme toggle did nothing in the embed. Hoist it out, prefixed.
    dark_match = re.search(r'^\[data-editor-theme="dark"\] \{\n(?:  --[^\n]*\n)+\}\n', rest, re.M)
    if not dark_match:
        raise ValueError("Could not locate the dark-theme custom-property rule to hoist out of @scope.")
    dark_rule = dark_match.group(0)
    rest = rest.replace(dark_rule, "", 1)
    dark_rule_hoisted = dark_rule.replace('[data-editor-theme="dark"] {', f'#{WRAPPER_ID}[data-editor-theme="dark"] {{', 1)

    root_self_rules = (
        "\n/* ── Rules that must target the wrapper itself, not a descendant of it -- "
        "kept OUTSIDE @scope (see SPECIFICITY NOTE in this script and in the header "
        "comment below). ── */\n"
        + RESET_RULE_NEW + "\n\n"
        + BODY_BLOCK_NEW + "\n\n"
        + dark_rule_hoisted + "\n"
        + "@media print {\n  " + PRINT_BODY_LINE_NEW.strip() + "\n}\n"
    )

    return (
        root_block
        + "\n"
        + root_self_rules
        + "\n/* ── Everything below is scoped to this widget only. REQUIRES CSS @scope "
          "(Chrome/Edge 118+, Firefox 128+, Safari 17.4+). An engine without @scope "
          "discards an unrecognised at-rule together with its whole block, so the widget "
          "would render unstyled there -- this is a hard requirement, not a graceful "
          "fallback. ── */\n"
        + f"@scope (#{WRAPPER_ID}) {{\n"
        + rest
        + "\n}\n"
    )


def transform_js(script: str) -> str:
    for old, new in JS_REDIRECTS:
        count = script.count(old)
        if count != 1:
            raise ValueError(f"Expected exactly 1 occurrence of {old!r}, found {count}.")
        script = script.replace(old, new)
    return script


def build_body(body: str) -> str:
    return body.replace("\n  <!-- Scripts -->\n", "\n")


def assemble(style: str, body: str, script: str) -> str:
    scoped_css = transform_css(style)
    redirected_js = transform_js(script)
    body_markup = build_body(body)

    out = HEADER_COMMENT
    out += f'<div id="{WRAPPER_ID}">\n<style>\n{scoped_css}\n</style>\n{body_markup}\n</div>\n\n<script>\n'
    out += (
        "// It is preferred to use a self-executing function around your script if\n"
        "// code should run on each page load\n"
        "// See https://developer.mozilla.org/en-US/docs/Glossary/IIFE\n"
        "    (function () {\n"
        "      // Re-entry guard: some host pages re-run embedded scripts without a\n"
        "      // full document reload. Without this, a second run would double-register\n"
        "      // every document/window-level listener below.\n"
        "      if (window.__dayScheduleEmbedLoaded) return;\n"
        "      window.__dayScheduleEmbedLoaded = true;\n\n"
        f"      var DS_ROOT = document.getElementById('{WRAPPER_ID}');\n"
        "      if (!DS_ROOT) return;\n\n"
        f"{redirected_js}\n"
        "    })()\n"
    )
    out += "</script>\n"
    return out


def main() -> None:
    html = read_text(SOURCE)
    style, body, script = extract(html)
    output = assemble(style, body, script)
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
