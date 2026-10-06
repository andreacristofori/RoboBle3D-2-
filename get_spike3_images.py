import urllib.request
from bs4 import BeautifulSoup
url = "https://lego.github.io/MINDSTORMS-Robot-Inventor-hub-API/class_light_matrix.html"
try:
    html = urllib.request.urlopen(url).read()
    soup = BeautifulSoup(html, "html.parser")
    print(soup.text[:1000])
except Exception as e:
    print(e)
