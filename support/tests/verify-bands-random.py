"""Independent physical/text checks for PDFs emitted by test-bands-random.cjs."""
import json
import re
import sys
from collections import Counter
from pathlib import Path
import pdfplumber

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'output/playwright/monte-carlo')
manifest = json.loads((root / 'results.json').read_text())
audit = []
compact = lambda text: re.sub(r'\s+', '', text)
for specimen in manifest['pdfs']:
    with pdfplumber.open(root / specimen['file']) as pdf:
        assert len(pdf.pages) == 1, (specimen['file'], 'day spilled onto another page')
        page = pdf.pages[0]
        assert (page.width, page.height) == (612, 792), specimen['file']
        chars = [char for char in page.chars if char['text'].strip()]
        text = ''.join(char['text'] for char in chars)
        def check(value, floor=9):
            needle = compact(value)
            if not needle:
                return
            locations = [match.start() for match in re.finditer(re.escape(needle), text)]
            assert locations, (specimen['file'], 'missing text', value)
            assert any(min(char['size'] for char in chars[index:index + len(needle)]) >= floor - .02 for index in locations), (specimen['file'], 'small type', value)
        check(specimen['title'], 10)
        for event in specimen['day']['events']:
            for field in ['title', 'description', 'location', 'poc']:
                check(event.get(field, ''))
            check(event['startTime'] + '-' + event['endTime'])
            names = specimen['expected'][event['id']]
            if names['mode'] == 'text':
                check(names['raw'])
            else:
                for name in names['entries']:
                    check(name, 9.5)
            for activity in event.get('flightActivities', []):
                for field in ['flight', 'title', 'description', 'location', 'poc']:
                    check(activity.get(field, ''))
        all_names = [name for event in specimen['day']['events'] for name in specimen['expected'][event['id']]['entries']]
        for name, count in Counter(all_names).items():
            assert text.count(compact(name)) >= count, (specimen['file'], 'missing repeated name', name)
        for note in specimen['day']['notes']:
            check(note['category'])
            check(note['text'])
        bounds = [min(char['x0'] for char in chars), min(char['top'] for char in chars), max(char['x1'] for char in chars), max(char['bottom'] for char in chars)]
        assert bounds[0] >= 35.9 and bounds[1] >= 35.9 and bounds[2] <= 576.1 and bounds[3] <= 756.1, (specimen['file'], 'print margins', bounds)
        audit.append({'file':specimen['file'], 'events':len(specimen['day']['events']), 'names':len(all_names), 'inkBoundsPt':bounds, 'pass':True})
(root / 'pdf-verification.json').write_text(json.dumps(audit, indent=2) + '\n')
print(f'PASS: {len(audit)} real Letter PDF pages retain every field and attendee entry within print margins and font floors.')
