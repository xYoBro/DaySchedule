#!/usr/bin/env python3
"""Build a single-file DaySchedule app shell at dist/DaySchedule.html.

The app data file may be bundled only when it is an inert placeholder.
Operational schedule data belongs in .schedule files or shared app/data JSON
files, not inside the launchable app shell.
"""

from __future__ import annotations

import datetime
import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "app"
INDEX = APP_DIR / "index.html"
DIST = ROOT / "dist"
OUTPUT = DIST / "DaySchedule.html"

LINK_RE = re.compile(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>')
SCRIPT_RE = re.compile(r'<script\s+src="([^"]+)"></script>')
SAFE_DATA_PLACEHOLDER_RE = re.compile(
    r"(?:(?:const|let|var)\s+)?SAVED_STATE\s*=\s*(?:null|\{\s*\})\s*;?"
)
CSP_META_RE = re.compile(
    r'<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*">'
)
# The bundled build inlines all scripts/styles, so 'self' no longer applies;
# connect-src 'none' blocks fetch/XHR/WebSocket/beacon in the app document.
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


def strip_placeholder_comments(source: str) -> str:
    # This is deliberately not a JavaScript parser. After comments are removed,
    # only the exact inert grammar below is accepted; every other token fails.
    return re.sub(r"//[^\r\n\u2028\u2029]*|/\*[\s\S]*?\*/", "", source).strip()


def is_data_placeholder(rel_path: str) -> bool:
    return (APP_DIR / rel_path).resolve() == (APP_DIR / "data/scheduledata.js").resolve()


def assert_safe_data_placeholder(rel_path: str, source: str) -> None:
    if not is_data_placeholder(rel_path):
        return
    executable_source = strip_placeholder_comments(source)
    if executable_source and not SAFE_DATA_PLACEHOLDER_RE.fullmatch(executable_source):
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


def stamp_app_version(source: str) -> str:
    # Hash the unstamped complete document, including the license and assets.
    # This identifies uncommitted changes and multiple builds on the same day.
    build_date = datetime.date.today().isoformat()
    fingerprint = hashlib.sha256(source.encode("utf-8")).hexdigest()[:12]
    stamped, count = re.subn(
        r"const APP_VERSION = 'dev';",
        f"const APP_VERSION = '{build_date}+{fingerprint}';",
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
        if is_data_placeholder(rel_path):
            # Do not distribute even placeholder comments: somebody may have
            # left a commented-out operational schedule in the legacy file.
            source = "// Schedule data stays in .schedule files; no data is bundled.\n"
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
    license_text = read_text(ROOT / "LICENSE").strip()
    if "-->" in license_text:
        raise ValueError("LICENSE cannot contain an HTML comment terminator.")
    html, doctype_count = re.subn(
        r"<!doctype\s+html>",
        lambda _match: "<!DOCTYPE html>\n<!--\n" + license_text + "\n-->",
        html, count=1, flags=re.IGNORECASE,
    )
    if doctype_count != 1:
        raise ValueError("The app shell needs an HTML doctype before its distribution license notice.")
    html = stamp_app_version(html)
    DIST.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
