import urllib.request, urllib.parse
url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote("site:pybricks.com spike 3 motor_pair")
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    import re
    snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL)
    for s in snippets:
        print(s[:200])
except Exception as e:
    pass
