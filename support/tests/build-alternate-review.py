#!/usr/bin/env python3
"""Verify PDF geometry and make a portable, read-only view comparison.

Run test-alternate-views.cjs first. Requires pdfplumber, pypdf and pdftoppm.
Only synthetic test output is read; this does not open or change app storage.
"""
import base64
import json
from pathlib import Path
import subprocess

import pdfplumber
from pypdf import PdfWriter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "output/playwright/alternate-views"
DEST = ROOT / "output/alternate-views"
VIEWS = ["cards", "grid", "phases"]
SAMPLES = ["normal", "forty", "light", "main", "mono"]


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    results = []
    for file in sorted(SOURCE.glob("*.pdf")):
        pages = []
        with pdfplumber.open(file) as pdf:
            for page in pdf.pages:
                chars = [char for char in page.chars if char["text"].strip()]
                assert (page.width, page.height) == (612, 792), file
                assert all(35.5 <= c["x0"] <= c["x1"] <= 576.5 and
                           35.5 <= c["top"] <= c["bottom"] <= 756.5
                           for c in chars), (file, page.page_number, "margins")
                minimum = min((c["size"] for c in chars), default=8)
                assert minimum >= 7.95, (file, page.page_number, "type floor")
                pages.append({"minimumGlyphPt": round(minimum, 3), "chars": len(chars)})
        results.append({"pdf": file.name, "pages": pages})
    assert results, "Run test-alternate-views.cjs first."
    (DEST / "physical-pdf-checks.json").write_text(json.dumps(results, indent=2))

    writer = PdfWriter()
    images = {}
    for view in VIEWS:
        for sample in SAMPLES:
            file = SOURCE / f"{view}-{sample}.pdf"
            if sample in ("normal", "forty"):
                label = "15 surnames" if sample == "normal" else "40 surnames + timed flights"
                writer.append(file, outline_item=f"{view.title()} — {label}")
            prefix = DEST / f"{view}-{sample}-print"
            subprocess.run(["pdftoppm", "-scale-to", "1400", "-png", str(file), str(prefix)], check=True)
            for day in (1, 2):
                data = Path(f"{prefix}-{day}.png").read_bytes()
                images[f"{view}-{sample}-{day}"] = "data:image/png;base64," + base64.b64encode(data).decode()
    writer.write(DEST / "Views-comparison.pdf")
    html = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DaySchedule · alternate views</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef0f3;color:#20262c;font:16px/1.5 system-ui,sans-serif}
header{background:white;padding:20px max(20px,calc((100% - 1100px)/2));border-bottom:1px solid #c8ced6}
h1{font-size:24px;margin:0}p{margin:5px 0 14px;color:#4b5563}.controls{display:flex;gap:16px;flex-wrap:wrap}
label{display:grid;gap:4px;font-size:13px;font-weight:600}select{font:16px system-ui;min-height:44px;padding:8px;border:1px solid #8c98a8;border-radius:6px;background:white;color:#20262c}
main{max-width:1100px;margin:20px auto;padding:0 16px}#purpose{margin-bottom:14px}img{display:block;width:100%;max-width:816px;height:auto;margin:auto;background:white;box-shadow:0 2px 16px #0002}
select:focus-visible,a:focus-visible{outline:3px solid #2c5d96;outline-offset:3px}a{color:#194275}
</style><header><h1>Cards, Grid &amp; Phases</h1>
<p>Actual print output, with synthetic examples. This comparison never opens or changes your schedule.</p>
<div class="controls"><label>View<select id="view"><option value="cards">Cards</option><option value="grid">Grid</option><option value="phases">Phases</option></select></label>
<label>Example<select id="sample"><option value="normal">15 surnames</option><option value="forty">40 surnames + timed flights</option><option value="light">Light day · no logo</option><option value="main">Main events only</option><option value="mono">40 surnames · grayscale</option></select></label>
<label>Day<select id="day"><option value="1">Saturday</option><option value="2" selected>Sunday</option></select></label></div></header>
<main><p id="purpose" aria-live="polite"></p><img id="page" alt="Schedule print proof"><p><a href="Views-comparison.pdf">Open the 12-page PDF comparison</a> · Each displayed page is US Letter.</p></main>
<script>const images=__IMAGES__;
const purpose={cards:'Main events and concurrent assignments have separate, chronological reading paths.',grid:'Every event appears once, in start-time order. Busy days continue down the left column, then down the right.',phases:'Contained activities sit under their main block. Assignments that span blocks or fall in gaps remain separate.'};
const view=document.querySelector('#view'),sample=document.querySelector('#sample'),day=document.querySelector('#day'),page=document.querySelector('#page');
function render(){page.src=images[view.value+'-'+sample.value+'-'+day.value];page.alt=view.selectedOptions[0].text+' — '+sample.selectedOptions[0].text+' — '+day.selectedOptions[0].text;document.querySelector('#purpose').textContent=purpose[view.value]}
[view,sample,day].forEach(control=>control.addEventListener('change',render));render();</script></html>'''
    (DEST / "review.html").write_text(html.replace("__IMAGES__", json.dumps(images)))
    print(f"Verified {len(results)} PDFs, {sum(len(r['pages']) for r in results)} Letter pages; built portable review and 12-page PDF.")


if __name__ == "__main__":
    main()
