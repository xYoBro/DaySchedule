#!/usr/bin/env python3
"""Build regression tests. All generated files stay in temporary copies."""

from __future__ import annotations

import html
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class BuildTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="dayschedule-build-test-")
        self.root = Path(self.temp.name)
        for directory in ("app", "tools"):
            shutil.copytree(ROOT / directory, self.root / directory)
        shutil.copy2(ROOT / "LICENSE", self.root / "LICENSE")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_builder(self, script: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(self.root / "tools" / script), *args],
            capture_output=True, text=True, check=False,
        )

    def test_operational_data_is_rejected_without_creating_output(self) -> None:
        for source in (
            'const SAVED_STATE = {"title":"PRIVATE"};',
            'const SAVED_STATE = {"title":"PRIVATE"}',
            'window["SAVED_STATE"] = {"title":"PRIVATE"};',
            'const SAVED_STATE = null; const PRIVATE = "secret";',
            'const SAVED_STATE = {}; fetch("https://example.invalid");',
            '// comment\u2028const SAVED_STATE = {"title":"PRIVATE"};',
        ):
            with self.subTest(source=source):
                (self.root / "app/data/scheduledata.js").write_text(source)
                result = self.run_builder("build-single-html.py")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Refusing to bundle", result.stderr)
                self.assertFalse((self.root / "dist/DaySchedule.html").exists())

    def test_placeholder_comments_are_not_distributed(self) -> None:
        (self.root / "app/data/scheduledata.js").write_text(
            '// PRIVATE test annotation\n/* inert comment */\nconst SAVED_STATE = {};\n'
        )
        result = self.run_builder("build-single-html.py")
        self.assertEqual(result.returncode, 0, result.stderr)
        output = (self.root / "dist/DaySchedule.html").read_text()
        self.assertFalse("PRIVATE test annotation" in output, "Placeholder comments leaked into the app shell.")
        self.assertIn("Permission is hereby granted", output)
        self.assertIn("Copyright (c)", output)

    def test_data_path_alias_cannot_bypass_the_guard(self) -> None:
        index = self.root / "app/index.html"
        index.write_text(index.read_text().replace('src="data/scheduledata.js"', 'src="./data/scheduledata.js"'))
        (self.root / "app/data/scheduledata.js").write_text('const SAVED_STATE = {"title":"PRIVATE"};')
        result = self.run_builder("build-single-html.py")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing to bundle", result.stderr)
        self.assertFalse((self.root / "dist/DaySchedule.html").exists())

    def test_build_stamp_distinguishes_source_changes(self) -> None:
        self.assertEqual(self.run_builder("build-single-html.py").returncode, 0)
        output = self.root / "dist/DaySchedule.html"
        stamp = lambda: re.search(r"const APP_VERSION = '([^']+)';", output.read_text())[1]
        first = stamp()
        self.assertRegex(first, r"^\d{4}-\d{2}-\d{2}\+[a-f0-9]{12}$")
        self.assertEqual(self.run_builder("build-single-html.py").returncode, 0)
        self.assertEqual(stamp().split("+")[1], first.split("+")[1])
        with (self.root / "app/js/utils.js").open("a") as file:
            file.write("\n// changed source for build-identity test\n")
        self.assertEqual(self.run_builder("build-single-html.py").returncode, 0)
        self.assertNotEqual(stamp(), first)

    def test_srcdoc_preserves_the_complete_standalone_document(self) -> None:
        result = self.run_builder("build-sharepoint-embed.py", "--build-dist")
        self.assertEqual(result.returncode, 0, result.stderr)
        output = (self.root / "dist/DaySchedule.sharepoint.html").read_text()
        srcdoc = re.search(r'\bsrcdoc="([\s\S]*?)"', output)
        self.assertIsNotNone(srcdoc)
        standalone = (self.root / "dist/DaySchedule.html").read_text()
        self.assertEqual(html.unescape(srcdoc[1]), standalone)
        self.assertIn("connect-src 'none'", standalone)
        self.assertFalse("<script>" in output, "The host snippet must not execute parent-page scripts.")
        self.assertFalse("__dayScheduleEmbedLoaded" in output, "The host snippet must not use a global boot guard.")

    def test_hosted_embed_accepts_only_https_urls(self) -> None:
        for url in (
            "javascript:alert(1)", "data:text/html,test", "http://example.org/app",
            "https://user:password@example.org/app", "https://@example.org/app",
            "https://example.org/app\n", "https://example.org\\app", "https://example.org:99999/app",
        ):
            with self.subTest(url=url):
                result = self.run_builder("build-sharepoint-embed.py", "--app-url", url)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((self.root / "dist/DaySchedule.sharepoint.html").exists())
        url = "https://example.org/DaySchedule.html?version=1&view=edit"
        result = self.run_builder("build-sharepoint-embed.py", "--app-url", url)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = (self.root / "dist/DaySchedule.sharepoint.html").read_text()
        self.assertIn('src="' + html.escape(url, quote=True) + '"', output)
        self.assertNotIn("srcdoc=", output)

    def test_missing_csp_fails_before_writing(self) -> None:
        index = self.root / "app/index.html"
        index.write_text(re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', "", index.read_text()))
        result = self.run_builder("build-single-html.py")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "dist/DaySchedule.html").exists())

    def test_missing_doctype_fails_before_writing(self) -> None:
        index = self.root / "app/index.html"
        index.write_text(index.read_text().replace("<!DOCTYPE html>", ""))
        result = self.run_builder("build-single-html.py")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "dist/DaySchedule.html").exists())

    def test_embed_rejects_missing_or_ineffective_connection_policy(self) -> None:
        (self.root / "dist").mkdir()
        for markup in (
            '<!-- Content-Security-Policy -->',
            '<meta http-equiv="Content-Security-Policy" content="connect-src https:">',
            '<meta http-equiv="Content-Security-Policy" content="connect-src https:; connect-src \'none\'">',
        ):
            with self.subTest(markup=markup):
                (self.root / "dist/DaySchedule.html").write_text(
                    '<html><head>' + markup + '</head><body>no effective policy</body></html>'
                )
                result = self.run_builder("build-sharepoint-embed.py")
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((self.root / "dist/DaySchedule.sharepoint.html").exists())


if __name__ == "__main__":
    unittest.main()
