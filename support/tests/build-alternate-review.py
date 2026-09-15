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
SAMPLES = ["groups", "normal", "forty", "stress", "light", "main", "mono"]


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
    samples = {}
    evidence = json.loads((SOURCE / "results.json").read_text())
    for view in VIEWS:
        for sample in SAMPLES:
            file = SOURCE / f"{view}-{sample}.pdf"
            if sample in ("groups", "normal", "forty", "stress"):
                label = {"groups": "Group exercise", "normal": "15 surnames", "forty": "40 surnames and flights", "stress": "15 concurrent events"}[sample]
                writer.append(file, outline_item=f"{view.title()} — {label}")
            prefix = DEST / f"{view}-{sample}-print"
            subprocess.run(["pdftoppm", "-scale-to", "1400", "-png", str(file), str(prefix)], check=True)
            with pdfplumber.open(file) as pdf:
                count = len(pdf.pages)
            record = next((r for r in evidence if r["skin"] == view and r["sample"] == sample and r["engine"] == "chromium"), None)
            samples[f"{view}-{sample}"] = {"pages": count, "fits": all(d["fit"] for d in record["days"]) if record else sample == "mono"}
            for day in range(1, count + 1):
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
<label>Example<select id="sample"><option value="groups">Four-group exercise</option><option value="normal">15 surnames</option><option value="forty">40 surnames + timed flights</option><option value="stress">15 concurrent events · long details</option><option value="light">Light day · no logo</option><option value="main">Main events only</option><option value="mono">Four-group exercise · grayscale</option></select></label>
<label>Printed page<select id="day"></select></label></div></header>
<main><p id="purpose"></p><p id="fit" role="status"></p><img id="page" alt="Schedule print proof"><p><a href="Views-comparison.pdf">Open the PDF comparison</a> · Each displayed page is US Letter.</p></main>
<script>const images=__IMAGES__,samples=__SAMPLES__;
const purpose={cards:'A shared timeline above each group’s complete agenda. Find your group once, then read down its panel.',grid:'Time × group columns. Shared events span the groups; continuing assignments join cells without duplicating event details.',phases:'Named phases progress vertically. Related tasks sit beneath their phase; assignments outside a phase stay independent.'};
const view=document.querySelector('#view'),sample=document.querySelector('#sample'),day=document.querySelector('#day'),page=document.querySelector('#page');
function render(reset){const key=view.value+'-'+sample.value,meta=samples[key];if(reset){day.replaceChildren(...Array.from({length:meta.pages},(_,i)=>new Option('Page '+(i+1),String(i+1))))}page.src=images[key+'-'+day.value];page.alt=view.selectedOptions[0].text+' — '+sample.selectedOptions[0].text+' — '+day.selectedOptions[0].text;document.querySelector('#purpose').textContent=purpose[view.value];document.querySelector('#fit').textContent=meta.fits?'Fits one Letter page per day.':'Exceeds one-page Fit in this view. Showing explicit Readable output across '+meta.pages+' pages; no content is omitted.'}
[view,sample].forEach(control=>control.addEventListener('change',()=>render(true)));day.addEventListener('change',()=>render(false));render(true);</script></html>'''
    (DEST / "review.html").write_text(html.replace("__IMAGES__", json.dumps(images)).replace("__SAMPLES__", json.dumps(samples)))
    print(f"Verified {len(results)} PDFs, {sum(len(r['pages']) for r in results)} Letter pages; built portable review and comparison PDF.")


if __name__ == "__main__":
    main()
