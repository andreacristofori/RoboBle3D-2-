import urllib.request, re
url = "https://html.duckduckgo.com/html/?q=site:lego.com+spike+python+button"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL)
    for s in snippets:
        s = re.sub(r'<[^>]+>', '', s)
        print(s.strip())
except Exception as e:
    print(e)
