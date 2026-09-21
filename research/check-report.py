import json, re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

root=Path(__file__).resolve().parent
class Inspect(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.links=[]; self.tags={}; self.in_table=False; self.row=[]; self.rows=[]; self.tables=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs); self.tags[tag]=self.tags.get(tag,0)+1
        if 'id' in attrs: self.ids.append(attrs['id'])
        if tag=='a': self.links.append(attrs.get('href',''))
        if tag=='table': self.in_table=True; self.rows=[]
        if self.in_table and tag=='tr': self.row=[]
        if self.in_table and tag in ('td','th'): self.row.append(tag)
    def handle_endtag(self,tag):
        if self.in_table and tag=='tr': self.rows.append(len(self.row))
        if tag=='table': self.tables.append(self.rows); self.in_table=False

issues=[]; results={}
for name in ['powercanvas-feasibility-report.html','Source-Index.html']:
    parser=Inspect(); parser.feed((root/name).read_text(encoding='utf-8'))
    if len(set(parser.ids))!=len(parser.ids): issues.append(name+': duplicate anchors')
    for link in parser.links:
        if link.startswith('#') and link[1:] not in parser.ids: issues.append(name+': missing anchor '+link)
        if link and not link.startswith(('#','http://','https://')):
            target=root/unquote(urlsplit(link).path)
            if not target.is_file(): issues.append(name+': missing local file '+link)
    for i, rows in enumerate(parser.tables):
        if len(set(rows))>1: issues.append(f'{name}: table {i+1} column mismatch {rows}')
    results[name]={'headings':sum(parser.tags.get('h'+str(n),0) for n in range(1,5)), 'tables':len(parser.tables), 'links':len(parser.links), 'ids':len(parser.ids)}
text=(root/'powercanvas-feasibility-report.md').read_text(encoding='utf-8')
experiments=re.findall(r'^### (\d+)\. ',text,re.M)
if experiments != [str(n) for n in range(1,11)]: issues.append('Experiment count/order mismatch')
if re.search(r'turn\d+(search|view|fetch)\d+',text): issues.append('Internal source identifiers leaked')
results['checks']={'experiments':len(experiments),'issues':issues,'visual_browser_review':'Not performed: browser tool blocks local-file URLs.'}
(root/'report-quality-check.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
raise SystemExit(bool(issues))
