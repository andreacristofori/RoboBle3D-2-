import urllib.request, urllib.parse, json, re

url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote("StartFileUploadRequest SPIKE 3")
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL)
    for s in snippets:
        print(s[:200])
except Exception as e:
    print(e)
