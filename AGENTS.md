# GBrain Local Operations Notes

Questo file e il punto di ingresso operativo per questa installazione locale di GBrain su `/home/lorenzo/gbrain`.

Se stai lavorando su questa macchina:

1. leggi prima questo file
2. usa poi la documentazione del repo (`docs/`, `README.md`, `llms.txt`) per i dettagli di implementazione

## Contesto locale

- Host utente: `lorenzo@ubuntu`
- Repo GBrain: `/home/lorenzo/gbrain`
- Home GBrain runtime: `/home/lorenzo/.gbrain`
- Servizio user systemd attuale: `/home/lorenzo/.config/systemd/user/gbrain-http.service`
- Sync Notion -> GBrain: `/home/lorenzo/notion-gbrain-sync`
- Pagina Notion sincronizzata: `Human for AI project`
- Rete locale osservata durante il setup: `192.168.2.254`
- Uso remoto deciso: tramite `VPN`, non tramite esposizione pubblica Internet

## Stato aggiornato del backend dati

Questa installazione NON usa piu PGLite come motore attivo.

Stato verificato in questa sessione:

- engine attivo: `postgres`
- config attiva: `/home/lorenzo/.gbrain/config.json`
- database attivo: `gbrain_db` su Postgres locale Docker
- container Docker Postgres: `n8n-postgres-1`
- estensione vettoriale verificata: `pgvector`

Controlli utili:

```bash
docker ps
docker inspect n8n-postgres-1
cd /home/lorenzo/gbrain && bun run src/cli.ts doctor --json
curl -s http://127.0.0.1:3131/health
```

Note importanti:

- il servizio HTTP GBrain oggi risponde con `engine: "postgres"` su `/health`
- il vecchio problema di lock PGLite resta utile come memoria storica, ma non descrive piu il runtime attuale
- il "database vettoriale" e incorporato nello stesso Postgres di GBrain tramite `pgvector`
- NON copiare segreti DB in questo file; per credenziali e valori runtime sensibili guarda la config locale o il container Docker

## Stato attuale del server GBrain

Il servizio HTTP di GBrain e attivo come servizio `systemd --user` e oggi usa il backend Postgres locale nel container Docker.

Comandi utili:

```bash
systemctl --user status gbrain-http.service
systemctl --user restart gbrain-http.service
systemctl --user stop gbrain-http.service
journalctl --user -u gbrain-http.service -f
```

File di servizio corrente:

```ini
[Unit]
Description=GBrain HTTP MCP server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/lorenzo/gbrain
Environment=PATH=/home/lorenzo/.local/bin:/home/lorenzo/.bun/bin:/home/lorenzo/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/usr/bin/env bun run src/cli.ts serve --http --port 3131 --bind 0.0.0.0
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Note importanti:

- Il server ascolta su porta `3131`
- Bind attuale: `0.0.0.0`
- Health check verificato con successo su `http://127.0.0.1:3131/health`
- Admin UI disponibile su `/admin`
- Endpoint MCP disponibile su `/mcp`
- Engine runtime verificato: `postgres`

## Admin login: come funziona qui

Questa versione di GBrain usa il flusso con `magic link` monouso per il login admin web.

Flusso:

1. il server ha un `bootstrap/admin token`
2. un agente o script fidato chiama `POST /admin/api/issue-magic-link`
3. GBrain restituisce un link monouso valido per pochi minuti
4. il browser apre quel link e ottiene la sessione

Quindi:

- il `bootstrap token` NON sostituisce il `magic link`
- `GBRAIN_ADMIN_BOOTSTRAP_TOKEN` serve solo a rendere stabile il token tra i riavvii
- per eliminare l'attrito va automatizzata la generazione del magic link, non bypassato il meccanismo

Durante il setup e stato verificato che:

- `POST /admin/api/issue-magic-link` richiede `Authorization: Bearer <bootstrap-token>`
- passare il token nel body JSON non funziona

## Accesso remoto deciso

Per questo host e stato scelto l'accesso tramite `VPN`.

Conseguenze operative:

- non e necessario pubblicare GBrain su Internet
- non aprire la porta `3131` verso l'esterno pubblico
- l'accesso remoto previsto e tramite IP VPN del server
- una volta connessi in VPN, la UI admin puo essere aperta su `http://<IP-VPN>:3131/admin`

Stato decisionale:

- soluzione preferita: VPN
- soluzione NON scelta: esposizione pubblica con reverse proxy Internet

## Note su bind e hardening

La configurazione corrente usa ancora:

```bash
--bind 0.0.0.0
```

Questo e comodo in LAN/VPN, ma non e la configurazione piu restrittiva.

Se in futuro si vuole ridurre ulteriormente la superficie:

- usare `--bind 127.0.0.1` se si accede solo via tunnel o tramite componenti locali
- mantenere `0.0.0.0` solo se l'accesso via VPN richiede connessione diretta all'IP VPN del server

Impostazioni consigliate ma non ancora applicate al servizio:

- `GBRAIN_ADMIN_BOOTSTRAP_TOKEN=<segreto forte e stabile>`
- `GBRAIN_HTTP_CORS_ORIGIN=<origin precisa, se necessaria>`

## Notion -> GBrain sync locale

Esiste un progetto separato:

- **Path**: `/home/lorenzo/notion-gbrain-sync`

Scopo:

- sincronizzare il subtree Notion `Human for AI project`
- creare/aggiornare in GBrain solo pagine esistenti in Notion
- marcare come `obsolete` in GBrain le pagine cancellate da Notion

Dettagli principali della sync:

- slug GBrain stabili basati su id Notion
- stato sync persistito in:
  `/home/lorenzo/notion-gbrain-sync/state/human-for-ai-project.json`
- modalita remota supportata via:
  - `GBRAIN_REMOTE_MCP_URL`
  - `GBRAIN_REMOTE_TOKEN`

Motivazione della modalita remota:

- storicamente, quando `gbrain serve --http` girava su PGLite, i comandi locali come `gbrain put` e `gbrain auth create` potevano fallire per lock PGLite
- in questa macchina tale lock e stato osservato realmente
- oggi il backend attivo e Postgres, ma la nota resta utile per capire perche la sync Notion e stata progettata in modalita remota

Timer/service systemd user del sync:

- `/home/lorenzo/.config/systemd/user/notion-gbrain-sync.service`
- `/home/lorenzo/.config/systemd/user/notion-gbrain-sync.timer`

## PGLite lock: problema storico gia osservato

Su questa installazione e gia successo:

- `gbrain auth create "notion-gbrain-sync"` -> timeout su lock PGLite

Causa:

- il server `gbrain serve --http` teneva il lock del brain PGLite

Implicazioni pratiche:

- evitare di contare su `gbrain put` locale mentre il server PGLite e in esecuzione
- preferire scritture remote HTTP MCP per automazioni come la sync Notion
- se serve creare un token locale via CLI, puo essere necessario fermare temporaneamente il servizio

Questa sezione descrive un comportamento storico. Dopo la migrazione a Postgres, il servizio locale non sta piu usando PGLite come datastore attivo.

## Migrazione PGLite -> Postgres eseguita in questa sessione

La migrazione e stata completata con successo in questa sessione.

Passi eseguiti:

1. backup di sicurezza in `/home/lorenzo/.gbrain/backups/`
2. stop temporaneo di `gbrain-http.service`
3. migrazione verso il database Postgres locale gia preparato
4. aggiornamento automatico della config attiva a `engine: "postgres"`
5. riavvio del servizio con verifica positiva

Comando usato:

```bash
cd /home/lorenzo/gbrain
bun run src/cli.ts migrate --to supabase --url '<database-url-locale-postgres>'
```

Backup creati:

- `/home/lorenzo/.gbrain/backups/config.json.20260628-112035`
- `/home/lorenzo/.gbrain/backups/brain.pglite.20260628-112035`

Esito verificato:

- pagine migrate: `1054`
- health endpoint ok
- servizio systemd tornato attivo su Postgres

Nota operativa:

- il database PGLite originale e stato preservato come backup/stato storico
- il file `~/.gbrain/brain.pglite` esiste ancora, ma non e piu il datastore attivo del servizio

## Database Postgres locale: dettagli operativi

Container osservato:

- **Nome**: `n8n-postgres-1`
- **Immagine**: `pgvector/pgvector:pg15`
- porta host: `5432`
- database GBrain: `gbrain_db`
- utente DB: `n8n`

Note:

- `gbrain_db` era gia presente ma vuoto prima della migrazione
- `gbrain doctor --json` ha applicato correttamente le migration/schema al target Postgres
- il DB usa `pgvector`, quindi il "database vettoriale" e incorporato nello stesso Postgres di GBrain
- per dettagli sensibili della connessione, consultare il runtime locale e non questo file

## Stato del corpus locale `/home/lorenzo/brain`

La cartella `/home/lorenzo/brain` e una copia locale derivata da un progetto Claude / wiki stile LLMWiki.

In questa sessione sono emerse e state confermate queste cose:

- la cartella conteneva rumore non utile per GBrain:
  - `.claude/`
  - `backups/`
  - `AGENTS.md`
  - `CLAUDE.md`
- quei contenuti sono stati rimossi dalla copia locale
- il corpus utile e rimasto nella cartella `brain`

Limite operativo attuale importante:

- `/home/lorenzo/brain` e un repository git senza commit
- per questo `gbrain sync --repo /home/lorenzo/brain` fallisce con assenza di `HEAD`
- **Conseguenza**: oggi quella cartella NON e ancora una source `syncabile` in senso pieno secondo il flusso git-first previsto da GBrain

Comando che ha mostrato il limite:

```bash
cd /home/lorenzo/gbrain
bun run src/cli.ts sync --source default --repo /home/lorenzo/brain --full --no-embed --no-extract --yes
```

Errore osservato:

- `No commits in repo /home/lorenzo/brain. Make at least one commit before syncing.`

## Pulizia del database dopo l'import del corpus locale

L'import iniziale della cartella `~/brain` aveva popolato il DB anche con contenuti indesiderati derivati dalla copia Claude/backup.

Pulizia eseguita in questa sessione:

- rimossi dal filesystem locale i percorsi-spazzatura
- rimossi dal database Postgres i record indesiderati corrispondenti a:
  - slug `backups/...`
  - slug `.claude/...`
  - slug `agents`
  - slug `claude`

Esito finale verificato:

- record rimossi dal DB: `99`
- pagine attive nella source `default`: `955`
- record spazzatura residui per quei pattern: `0`

Conteggi strutturali verificati dopo la pulizia:

- `pages` attive source `default`: `955`
- `content_chunks`: `2559`
- `links` con pagina sorgente attiva: `465`

Nota importante sulla forma dei record:

- una parte dei record spazzatura importati non aveva `source_path`
- per questo la pulizia finale ha dovuto riconoscere i record dallo `slug`, non solo dal path di origine

## Stato sources GBrain rilevato in questa sessione

Stato osservato con `gbrain sources list --json`:

- esiste solo la source `default`
- `default` contiene le pagine del brain
- `default.local_path` risulta ancora `null`

Conseguenza:

- GBrain oggi funziona e serve il brain da Postgres
- ma la relazione `repo markdown locale -> sync git-first -> DB` non e ancora completamente riallineata per la source `default`
- per riallinearla bene serve una cartella `brain` con almeno un commit git e poi una sync riuscita

## Visualizzazione del grafo: stato reale del progetto

In questa sessione e stato verificato che la repo NON documenta una UI grafica interattiva pronta all'uso per il brain graph.

Quello che esiste oggi:

- knowledge graph interno
- comandi CLI di traversata:
  - `gbrain graph <slug> --depth N`
  - `gbrain graph-query <slug> --depth N`
  - `gbrain graph-query <slug> --type <link_type> --direction in|out|both`

Stato della documentazione:

- `README.md` descrive il self-wiring knowledge graph
- `src/commands/graph-query.ts` documenta un output testuale `indented tree of edges`
- non sono state trovate istruzioni ufficiali per una mappa visuale interattiva del brain

## URL e endpoint confermati durante il setup

- Health locale: `http://127.0.0.1:3131/health`
- Admin locale: `http://127.0.0.1:3131/admin`
- MCP locale: `http://127.0.0.1:3131/mcp`
- Accesso LAN usato in fase di test: `http://192.168.2.254:3131/admin`

## Quando si lavora su questa repo

- Per le modifiche al codice, usa la documentazione architetturale del repo (`docs/architecture/`, `docs/TESTING.md`, `llms.txt`)
- Per le modifiche operative locali, aggiorna questo file
- Se cambi il modo in cui gira il servizio locale, aggiorna anche:
  - `/home/lorenzo/.config/systemd/user/gbrain-http.service`
  - questo file
  - eventuali script esterni che mintano magic link o usano il token bootstrap

## Decisioni operative da ricordare

- GBrain locale serve su `3131`
- login admin via magic link monouso
- accesso remoto previsto tramite VPN
- backend attivo oggi: `Postgres`, non `PGLite`
- database attivo: `gbrain_db` nel container `n8n-postgres-1`
- sync Notion separata in `/home/lorenzo/notion-gbrain-sync`
- il corpus `~/brain` e stato ripulito dai file ereditati dal progetto Claude
- la source `default` non e ancora agganciata a un `local_path` syncabile perche `~/brain` non ha commit git
- evitare di assumere che la CLI `sync` funzioni su `~/brain` finche non esiste almeno un commit

## Riferimenti del repo

Per il resto della documentazione:

- `README.md`
- `docs/mcp/DEPLOY.md`
- `docs/architecture/KEY_FILES.md`
- `docs/TESTING.md`
- `llms.txt`
- `llms-full.txt`
