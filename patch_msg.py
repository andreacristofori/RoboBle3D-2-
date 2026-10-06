with open("src/App.tsx", "r") as f:
    content = f.read()

content = content.replace("[Attesa avvio: Premi il tasto CENTRALE (o Sinistro/Destro) sul robot per avviare il codice. In seguito, premi il tasto Centrale per interrompere!]", "[Attesa avvio (Spike 3): Premi il tasto SINISTRO o DESTRO sul robot per avviare il codice! Il tasto centrale potrebbe essere riservato al sistema.]")

with open("src/App.tsx", "w") as f:
    f.write(content)
