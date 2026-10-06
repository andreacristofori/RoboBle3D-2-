import urllib.request
url = "https://raw.githubusercontent.com/sanjayseshan/spikeprime-tools/main/docs/hub/light_matrix.md"
try:
    print("Trying...", url)
    html = urllib.request.urlopen(url).read().decode('utf-8')
    print(html[:500])
except Exception as e:
    print(e)
