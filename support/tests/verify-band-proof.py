"""Verify actual integrated-app PDF output against the captured synthetic days."""
import json
import re
import sys
from collections import Counter
from pathlib import Path
import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, FloatObject

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'output/pdf/integrated-bands')
expected = json.loads((root / 'expected.json').read_text())

def compact(value):
    return re.sub(r'\s+', '', value)

def verify(path):
    audit = []
    with pdfplumber.open(path) as pdf:
        assert len(pdf.pages) == len(expected), 'A day overflowed to another page'
        for page, specimen in zip(pdf.pages, expected):
            label = f"{specimen['sample']}/{specimen['day']}"
            assert (page.width, page.height) == (612, 792), label
            chars = [char for char in page.chars if not char['text'].isspace()]
            text = ''.join(char['text'] for char in chars)
            def sizes(value):
                needle = compact(value)
                return [min(c['size'] for c in chars[m.start():m.end()]) for m in re.finditer(re.escape(needle), text)]
            assert 'Schedulenotreadytoprint' not in text, label
            for event in specimen['events']:
                for field in ['title','description','location','poc']:
                    if event.get(field):
                        assert compact(event[field]) in text, (label, event['id'], field)
                        assert max(sizes(event[field])) >= 8.99, (label, event['id'], field, 'font')
                assert event['startTime'] + '-' + event['endTime'] in text, (label, event['id'], 'time')
                for activity in event.get('flightActivities', []):
                    for field in ['flight','title','description','location','poc']:
                        if activity.get(field):
                            assert compact(activity[field]) in text, (label, activity['id'], field)
                    if activity['startTime'] != event['startTime'] or activity['endTime'] != event['endTime']:
                        assert activity['startTime'] + '-' + activity['endTime'] in text, (label, activity['id'], 'time')
            for name, count in Counter(specimen['nameEntries']).items():
                assert text.count(compact(name)) >= count, (label, 'missing roster entries', name)
                assert max(sizes(name)) >= 9.49, (label, name, 'name minimum')
            for note in specimen['notes']:
                for field in ['category','text']:
                    if note.get(field):
                        assert compact(note[field]) in text, (label, 'note', note[field])
                        assert max(sizes(note[field])) >= 8.99, (label, 'note minimum')
            assert compact(specimen['title']) in text
            assert 'Notes&Reminders' in text
            assert ('Concurrentevents' in text) == (specimen['sample'] != 'main')
            bounds = [min(c['x0'] for c in chars), min(c['top'] for c in chars), max(c['x1'] for c in chars), max(c['bottom'] for c in chars)]
            assert bounds[0] >= 35.98 and bounds[1] >= 35.98 and bounds[2] <= 576.02 and bounds[3] <= 756.02, (label, 'ink margins', bounds)
            logo = next(r for r in page.rects if abs(r['x0']-36.375)<.05 and abs(r['top']-36.375)<.05)
            assert abs(logo['width']-71.25)<.05 and abs(logo['height']-71.25)<.05, (label, 'logo')
            rules = sorted(r['top'] for r in page.rects if r['width'] > 535 and r['height'] < 2 and 640 < r['top'] < 760)[-2:]
            assert len(rules) == 2 and abs(rules[1]-rules[0]-93)<.05, (label, 'notes area', rules)
            audit.append({'sample':label,'page':page.page_number,'events':len(specimen['events']),'attendeeEntries':specimen['names'],'columns':len(specimen['groups']),'inkBoundsPt':bounds,'pass':True})
    return audit

def grayscale(source, destination):
    reader=PdfReader(source);writer=PdfWriter();writer.clone_document_from_reader(reader)
    for page in writer.pages:
        stream=ContentStream(page.get_contents(),writer)
        for i,(args,op) in enumerate(stream.operations):
            if op in (b'rg',b'RG'):
                gray=sum(float(v)*w for v,w in zip(args,(.2126,.7152,.0722)))
                stream.operations[i]=([FloatObject(gray)],b'g' if op==b'rg' else b'G')
            elif op in (b'k',b'K',b'sc',b'SC',b'scn',b'SCN'):
                raise AssertionError('Unexpected color operator')
        page.replace_contents(stream)
        assert not page.get('/Resources',{}).get('/XObject'), 'Unexpected external graphics'
    with destination.open('wb') as output:writer.write(output)

source=root/'banded-layout-proof.pdf';gray=root/'banded-layout-proof-grayscale.pdf'
audit={'color':verify(source)}
grayscale(source,gray);audit['grayscale']=verify(gray)
(root/'verification.json').write_text(json.dumps(audit,indent=2)+'\n')
print(f'PASS: {len(expected)} color and {len(expected)} grayscale Letter pages; complete fields, rosters, flights, notes, fonts and margins.')
