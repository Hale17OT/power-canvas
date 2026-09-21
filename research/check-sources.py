import concurrent.futures, json, re, urllib.request, urllib.error
from pathlib import Path

root = Path(__file__).resolve().parent
sources = json.loads((root / 'sources.json').read_text(encoding='utf-8'))

def check(source):
    item = dict(source)
    try:
        req = urllib.request.Request(source['url'], headers={'User-Agent': 'Mozilla/5.0 PowerCanvasResearchCitationCheck/1.0'})
        with urllib.request.urlopen(req, timeout=22) as response:
            body = response.read(1800000).decode('utf-8', errors='replace')
            item.update(status=response.status, final_url=response.url)
            title = re.search(r'<title[^>]*>(.*?)</title>', body, re.S | re.I)
            item['page_title'] = re.sub(r'\s+', ' ', title.group(1)).strip() if title else ''
            date = re.search(r'<meta\s+name="(?:ms.date|updated_at)"\s+content="([^"]+)"', body, re.I)
            if date: item['page_date'] = date.group(1)
    except urllib.error.HTTPError as error:
        item.update(status=error.code, error=str(error))
    except Exception as error:
        item.update(status='unverified', error=str(error))
    return item

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(check, sources))
(root / 'source-link-check.json').write_text(json.dumps({'checked':'2026-09-17','method':'Public unauthenticated HTTP GET; failures may reflect access controls rather than missing pages.','results':results}, indent=2), encoding='utf-8')
issues = [r for r in results if r['status'] != 200]
print(json.dumps({'checked':len(results),'http_200':len(results)-len(issues),'issues':issues}, indent=2))
