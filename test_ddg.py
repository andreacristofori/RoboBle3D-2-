import urllib.request, urllib.parse, re
url = "https://lite.duckduckgo.com/lite/"
data = urllib.parse.urlencode({'q': 'spike 3 prime python "button.pressed"'}).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    snippets = re.findall(r'<td class="result-snippet">([^<]+)</td>', html, re.IGNORECASE)
    for s in snippets:
        print(s.strip())
except Exception as e:
    print(e)
