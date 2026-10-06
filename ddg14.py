import urllib.request, urllib.parse, json, re

url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote("SPIKE 3 protocol file upload .py slot")
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL)
    for s in snippets:
        print(s)
except Exception as e:
    print(e)
