import urllib.request, urllib.parse, json, re
url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote("SPIKE Prime GATT service UUID")
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req).read().decode("utf-8")
links = re.findall(r'<a class="result__url" href="([^"]+)"', html)
for l in links:
    print(l)
