import urllib.request
html = urllib.request.urlopen('https://raw.githubusercontent.com/virantha/bricknil/master/bricknil/const.py').read().decode('utf-8')
for line in html.split('\n'):
    if 'UUID' in line.upper(): print(line)
