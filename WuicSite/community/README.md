# Community organic outreach kit

Drafts pronti per il batch di outreach Sprint 4 (community organic). Niente
viene pubblicato automaticamente — tutto richiede paste + send manuale via
LinkedIn / Reddit / Stack Overflow.

## Cosa c'è dentro

### `linkedin/posts.md`

10 LinkedIn post allineati 1:1 con il calendario di pubblicazione dev.to
(31 maggio → 9 giugno 2026). Più 3 post "background" per la settimana 2+
(demo asset, thought leadership, engineering retro).

**Cadenza consigliata**: 1 post al giorno alle 09:30 Europe/Rome (30 min
dopo il reminder dev.to delle 09:00).

**Tutti i link** puntano alla canonica wuic-framework.com, non a dev.to,
così Google attribuisce SEO juice al sito ufficiale.

### `reddit/r-angular-origin-story.md`

Post draft per **r/Angular** (1.4M membri). Format self-deprecating "5
years building, here's what I'd do differently" che storicamente performa
bene sul subreddit. Include reply playbook per i commenti che arrivano.

**Pubblicare martedì 14-16 UTC** per il peak engagement. NO link nel
titolo o nei primi paragrafi (Reddit penalizza i promotional post). Link
solo nell'edit di chiusura.

### `reddit/r-dotnet-linux-deploy.md`

Post draft per **r/dotnet** (320k membri). Angle è la migrazione live
verso Linux/Kestrel — l'audience .NET è ricettiva a write-up tecnici di
migrazione reale. Mentions WUIC come "what we did", non come prodotto da
vendere.

**Pubblicare mercoledì 13-15 UTC**.

### `stackoverflow/targets.md`

NON un blast di risposte. È un monitor + answer playbook:
- 10 tag/query da watch-are nel profilo SO
- 3 template di risposta paste-ready (CRUD scaffolding, PrimeNG mobile,
  Linux deploy)
- Cosa NON fare per non finire flaggato come spam (link in primo
  paragrafo, post template ripetuti in 24h, sock-puppet upvotes, etc).

**Cadenza consigliata**: 30 min/giorno, max 2 risposte/giorno.

## Workflow per la settimana 1 (1-9 giugno)

Ogni mattina alle 09:30 Europe/Rome (30 min dopo il reminder dev.to):

1. Apri `linkedin/posts.md` → trova "Day N — 2026-06-0N"
2. Copia il blocco del giorno
3. Apri https://www.linkedin.com/feed/ → "Start a post" → paste
4. Pubblica
5. (Spunta mentalmente; non ho creato un manifest per LinkedIn perché
   è meno strutturato di dev.to)

## Workflow per il Reddit drop

**Una sola volta**, settimana 2 o 3 quando hai già 5+ articoli pubblicati
su dev.to (così il post Reddit non sembra "sto provando a vendere un
prodotto nuovo" ma "sto raccontando 5 anni di lavoro"):

1. Pubblica r/Angular post **martedì**
2. Spazia 48h
3. Pubblica r/dotnet post **giovedì**

**NO** pubblicare entrambi lo stesso giorno (i mod controllano la cross-
posting frequency degli account).

## Workflow per Stack Overflow

In background, 30 min/giorno per le prossime 4-6 settimane:

1. Sub-scriviti ai tag elencati in `stackoverflow/targets.md`
2. Filtra le notifiche per "questions today"
3. Quando trovi una domanda dove WUIC è risposta genuina, usa uno dei
   template + disclosure "I work on this"
4. Resta sotto le 2 risposte/giorno

## Cosa NON è ancora qui (e quando aggiungerlo)

- **dev.to comment replies** — non serve un draft, rispondi quando arrivano
- **Discord / Slack** — l'audience che ci interessa (Angular / .NET dev pros)
  non sta lì; meglio LinkedIn
- **Twitter/X** — Twitter è in declino come canale dev EU; lo aggiungiamo
  in Sprint 5 con un cross-post dei thread LinkedIn
- **Newsletter** — Sprint 4 traccia 🥈 separato (Buttondown)
