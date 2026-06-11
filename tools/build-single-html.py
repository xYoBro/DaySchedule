#!/usr/bin/env python3
"""Build a single-file DaySchedule app shell at dist/DaySchedule.html.

The app data file may be bundled only when it is an inert placeholder.
Operational schedule data belongs in .schedule files or shared app/data JSON
files, not inside the launchable app shell.
"""

from __future__ import annotations

import datetime
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "app"
INDEX = APP_DIR / "index.html"
DIST = ROOT / "dist"
OUTPUT = DIST / "DaySchedule.html"

LINK_RE = re.compile(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>')
SCRIPT_RE = re.compile(r'<script\s+src="([^"]+)"></script>')
SAVED_STATE_RE = re.compile(r"\bSAVED_STATE\s*=\s*(.+?)\s*;", re.DOTALL)
SAFE_SAVED_STATE_RE = re.compile(r"^(?:null|\{\s*\})$")
CSP_META_RE = re.compile(
    r'<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*">'
)
# The bundled build inlines all scripts/styles, so 'self' no longer applies;
# connect-src 'none' (no outbound network, ever) is the part that must survive.
DIST_CSP = (
    '<meta http-equiv="Content-Security-Policy" content="'
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
    "img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'"
    '">'
)


def read_text(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"Cannot bundle missing asset: {path}")
    return path.read_text(encoding="utf-8")


def strip_line_comments(source: str) -> str:
    return "\n".join(
        line for line in source.splitlines()
        if not line.lstrip().startswith("//")
    )


def assert_safe_data_placeholder(rel_path: str, source: str) -> None:
    if rel_path != "data/scheduledata.js":
        return
    executable_source = strip_line_comments(source)
    match = SAVED_STATE_RE.search(executable_source)
    if match and not SAFE_SAVED_STATE_RE.match(match.group(1).strip()):
        raise ValueError(
            "Refusing to bundle app/data/scheduledata.js because it appears to "
            "contain operational save data. Save schedules through the app instead."
        )


def bundle_styles(html: str) -> str:
    def replace(match: re.Match[str]) -> str:
        rel_path = match.group(1)
        source = read_text(APP_DIR / rel_path)
        return f"<style>\n{source}\n</style>"

    return LINK_RE.sub(replace, html)


def stamp_app_version(rel_path: str, source: str) -> str:
    if rel_path != "js/constants.js":
        return source
    build_date = datetime.date.today().isoformat()
    stamped, count = re.subn(
        r"const APP_VERSION = 'dev';",
        f"const APP_VERSION = '{build_date}';",
        source,
    )
    if count != 1:
        raise ValueError(
            "Expected exactly one APP_VERSION = 'dev' in js/constants.js "
            f"(found {count}). The build stamp must not be removed."
        )
    return stamped


def bundle_scripts(html: str) -> str:
    def replace(match: re.Match[str]) -> str:
        rel_path = match.group(1)
        source = read_text(APP_DIR / rel_path)
        assert_safe_data_placeholder(rel_path, source)
        source = stamp_app_version(rel_path, source)
        return f"<script>\n{source}\n</script>"

    return SCRIPT_RE.sub(replace, html)


def rewrite_csp(html: str) -> str:
    rewritten, count = CSP_META_RE.subn(DIST_CSP, html)
    if count != 1:
        raise ValueError(
            "Expected exactly one Content-Security-Policy meta tag in app/index.html "
            f"(found {count}). The data-locality guarantee must not be removed."
        )
    return rewritten


def main() -> None:
    html = read_text(INDEX)
    html = rewrite_csp(html)
    html = bundle_styles(html)
    html = bundle_scripts(html)
    DIST.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
