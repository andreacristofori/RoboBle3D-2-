import urllib.request, json
url = "https://html.duckduckgo.com/html/?q=site:lego.com+spike+python+button+pressed"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    print("HTML length:", len(html))
except Exception as e:
    print(e)
