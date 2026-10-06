import urllib.request
import re

url = "https://raw.githubusercontent.com/sanjayseshan/spikeprime-tools/main/js/ble.js"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    for line in html.split('\n'):
        if 'filename' in line.lower() or 'upload' in line.lower() or 'slot' in line.lower():
            print(line)
except Exception as e:
    print(e)
