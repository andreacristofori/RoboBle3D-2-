Hai perfettamente ragione, l'inconveniente era proprio che il programma rimaneva "bloccato" all'infinito nel ciclo aspettando che i motori completassero il movimento, ignorando il fatto che fossero assenti o su porte sbagliate!

Ho appena aggiunto un **meccanismo di ripristino di emergenza** e di timeout:
Se il robot si accorge che sta cercando di leggere costantemente la posizione di un motore che non c'è (dando l'errore `ENODEV` per più di 5 volte di fila), **interrompe immediatamente l'operazione in corso** invece di bloccarsi.

In questo modo:
1. Il codice non va più in stallo e può proseguire (o terminare).
2. Viene visualizzato un avviso chiaro nel terminale dicendo `Errore lettura motori (forse scollegati). Interrompo per evitare blocco.`
3. Lo Spike non rimarrà freezato.

**Cosa fare ora:**
- **Ricarica la pagina** per ottenere l'aggiornamento.
- Prova di nuovo ad eseguire il codice con le porte sbagliate di proposito: ora dovresti vedere che non rimane più bloccato per sempre e si ferma dopo una frazione di secondo dal momento dell'errore, restituendo i comandi!
