# Hubble Compleanno 🎂🔭

[![Deploy with Vercel](https://vercel.com/button.svg)](https://vercel.com/new/clone?repository-url=https://github.com/Trisert/hubble-compleanno&env=NASA_API_KEY&envDescription=NASA%20API%20Key%20da%20https://api.nasa.gov&project-name=hubble-compleanno&repository-name=hubble-compleanno)

Scopri cosa ha fotografato il telescopio Hubble nel giorno del tuo compleanno. Inserisci una data e visualizza l'immagine NASA del giorno corrispondente, con titolo, descrizione e crediti.

> Progetto Next.js (App Router) pensato per il free tier di Vercel. Nessun login, nessun database.

## Stack

- **Next.js 16** + App Router + TypeScript
- **Tailwind CSS 4**
- Deploy su **Vercel**

## Configurazione chiave NASA

1. Registrati su [api.nasa.gov](https://api.nasa.gov/) e genera una API key gratuita.
2. Imposta la variabile d'ambiente `NASA_API_KEY`:

   **Locale** — crea `.env.local` nella root:

   ```bash
   NASA_API_KEY=la_tua_chiave_nasa
   ```

   **Vercel** — Dashboard → Project → *Settings → Environment Variables* → aggiungi `NASA_API_KEY` (Environment: Production, Preview, Development) → Redeploy.

> Senza `NASA_API_KEY` l'app usa `DEMO_KEY` (rate limit molto basso, non adatto alla produzione).

## Sviluppo locale

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build di produzione
npm start        # serve il build
npm run lint     # eslint
```

Richiede Node.js 18+.

## Deploy su Vercel

```bash
# opzione CLI
npm i -g vercel
vercel --prod
```

Oppure: importa il repo da [vercel.com/new](https://vercel.com/new) → imposta `NASA_API_KEY` nelle Environment Variables → Deploy. Ogni push su `main` ridistribuisce automaticamente.

## API interne

### `GET /api/hubble?date=YYYY-MM-DD`

Restituisce l'immagine Hubble/NASA per la data richiesta.

**Parametri**

| Param | Tipo | Obbligatorio | Descrizione |
|-------|------|--------------|-------------|
| `date` | `string` | sì | Data in formato `YYYY-MM-DD` |

**Risposta — `HubbleResponse`**

```ts
type HubbleResponse = {
  imageUrl: string;       // url immagine (mai raw FITS)
  hdImageUrl?: string;
  title: string;
  caption: string;        // 2-4 frasi riassunte
  source: string;         // es. "NASA APOD" o "NASA Image Library — Hubble"
  creditedTo: string;     // copyright/credit
  actualDate: string;     // YYYY-MM-DD reale immagine
  requestedDate: string;  // YYYY-MM-DD richiesta
  isFallback: boolean;
  mediaType: "image";
}
```

**Errori**

| Status | Caso |
|--------|------|
| `400` | `date` mancante, formato non valido o fuori range 1995-06-16 → oggi |
| `429` | Rate limit NASA superato |
| `502`/`503` | Upstream NASA non disponibile |
| `404` | Nessun risultato nel fallback per l'anno |

**Esempio**

```bash
curl "http://localhost:3000/api/hubble?date=2000-06-15"
```

## API esterne utilizzate

| API | Ruolo | Docs |
|-----|-------|------|
| **NASA APOD** (`api.nasa.gov/planetary/apod`) | Fonte primaria — Astronomy Picture of the Day | [api.nasa.gov](https://api.nasa.gov/) |
| **NASA Image and Video Library** (`images-api.nasa.gov`) | Fallback se APOD non disponibile per la data | [images.nasa.gov](https://images.nasa.gov/docs/docs/api/api.md) |

Nessun'altra API o servizio esterno. Nessun tracciamento.

## Fallback e gestione errori

1. **APOD prima, Image Library poi** — la route chiama APOD con `date` + `NASA_API_KEY`. Se APOD risponde con errore / contenuto mancante / `media_type` non visualizzabile, effettua una ricerca su NASA Image Library (query `hubble` + filtro data) e restituisce il primo risultato utile con `source: "nasa-image-library"`.
2. **Cache** — le risposte APOD sono deterministiche per data: l'API imposta `Cache-Control: public, s-maxage=86400` (1 giorno) per sfruttare la CDN Vercel e ridurre le chiamate NASA.
3. **Rate limit** — con `DEMO_KEY` il limite è ~30 req/ora/IP; con chiave personale ~1000 req/ora. Errori `429` vengono propagati al client con messaggio esplicito.
4. **Validazione** — date future o malformate vengono rifiutate con `400`.

## Design e note

- **App Router** — una sola pagina client con selettore data + fetch a `/api/hubble`; immagini ottimizzate con `next/image` (domini NASA in `next.config.ts` → `remotePatterns`).
- **Nessun stato server** — nessun login, DB o cookie; la data è l'unico input.
- **Accessibilità & responsive** — layout mobile-first, alt text da `title`/`explanation`.
- **Dark mode** — via `prefers-color-scheme` / classe Tailwind.
- **Costo zero** — resta interamente nel free tier Vercel + API NASA gratuite.

## Licenza

Contenuti NASA di pubblico dominio (se non diversamente indicato nel campo `copyright`). Codice MIT.
