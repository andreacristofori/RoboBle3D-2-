import urllib.request
url = "https://education.lego.com/en-us/lessons/prime-getting-started/getting-started-with-python/"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    import re
    # find everything containing motor_pair
    matches = re.findall(r'motor_pair.*?[\r\n]', html)
    for m in matches:
        print(m)
except Exception as e:
    print(e)
