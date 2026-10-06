import urllib.request
url = "https://raw.githubusercontent.com/sanjayseshan/spikeprime-tools/master/js/hub.js"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    data = urllib.request.urlopen(req).read().decode('utf-8')
    for line in data.split('\n'):
        if 'startFileUpload' in line or 'upload' in line.lower() or 'slot' in line.lower() or 'filename' in line.lower():
            print(line)
except Exception as e:
    print(e)
