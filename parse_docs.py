import urllib.request
import re

url = "https://education.lego.com/en-us/lessons/prime-getting-started/getting-started-with-python/"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    matches = re.findall(r'light_matrix.*?[\r\n]', html)
    for m in matches:
        print(m)
except Exception as e:
    print(e)
