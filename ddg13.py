import urllib.request, json
url = "https://api.github.com/repos/sanjayseshan/spikeprime-tools/contents"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    data = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
    for f in data:
        print(f['name'])
except Exception as e:
    print(e)
