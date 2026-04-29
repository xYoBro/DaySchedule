#!/usr/bin/env python3
"""Build a single-file DaySchedule app shell at dist/DaySchedule.html.

The app data file may be bundled only when it is an inert placeholder.
Operational schedule data belongs in .schedule files or shared app/data JSON
files, not inside the launchable app shell.
"""

from __future__ import annotations

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


def bundle_scripts(html: str) -> str:
    def replace(match: re.Match[str]) -> str:
        rel_path = match.group(1)
        source = read_text(APP_DIR / rel_path)
        assert_safe_data_placeholder(rel_path, source)
        return f"<script>\n{source}\n</script>"

    return SCRIPT_RE.sub(replace, html)


def main() -> None:
    html = read_text(INDEX)
    html = bundle_styles(html)
    html = bundle_scripts(html)
    DIST.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
