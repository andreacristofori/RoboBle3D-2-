import urllib.request, urllib.parse, json

url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote("Spike 3 python button is_pressed")
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    import re
    # print snippets
    snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL)
    for s in snippets:
        print(s[:200])
except Exception as e:
    print(e)
