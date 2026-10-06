import urllib.request
url = "https://raw.githubusercontent.com/sanjayseshan/spikeprime-tools/main/docs/hub/light_matrix.md"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    print(urllib.request.urlopen(req).read().decode("utf-8")[:1000])
except Exception as e:
    print(e)
