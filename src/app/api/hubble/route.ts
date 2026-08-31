import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Contratto
// ---------------------------------------------------------------------------
export type HubbleResponse = {
  imageUrl: string;
  hdImageUrl?: string;
  title: string;
  caption: string; // 2-4 frasi
  source: string;
  creditedTo: string;
  actualDate: string; // YYYY-MM-DD
  requestedDate: string; // YYYY-MM-DD
  isFallback: boolean;
  mediaType: "image";
};

type ApodResponse = {
  date: string;
  explanation: string;
  hdurl?: string;
  media_type: string;
  service_version: string;
  title: string;
  url: string;
  copyright?: string;
  code?: number;
  msg?: string;
  error?: string;
};

type NasaLibraryItem = {
  data: Array<{
    title: string;
    description?: string;
    description_508?: string;
    date_created: string;
    keywords?: string[];
    photographer?: string;
    secondary_creator?: string;
    nasa_id: string;
    center?: string;
  }>;
  links?: Array<{
    href: string;
    rel: string;
    render?: string;
  }>;
  href: string; // collection manifest
};

type NasaLibrarySearchResponse = {
  collection: {
    items: NasaLibraryItem[];
    metadata: { total_hits: number };
  };
};

// ---------------------------------------------------------------------------
// Costanti
// ---------------------------------------------------------------------------
const MIN_DATE_STR = "1995-06-16";
const MIN_DATE = new Date(MIN_DATE_STR + "T00:00:00Z");
const DEMO_KEY = "DEMO_KEY";
const APOD_ENDPOINT = "https://api.nasa.gov/planetary/apod";
const LIBRARY_ENDPOINT = "https://images-api.nasa.gov/search";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidDateFormat(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseDateUTC(s: string): Date | null {
  if (!isValidDateFormat(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  // Verifica che non ci sia overflow (es. 2024-02-30 -> 2024-03-01)
  const iso = d.toISOString().slice(0, 10);
  if (iso !== s) return null;
  return d;
}

function todayUTCString(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayUTCDate(): Date {
  return new Date(todayUTCString() + "T00:00:00Z");
}

/**
 * Riassume un testo in 2-4 frasi.
 * - Normalizza whitespace
 * - Split su delimitatori di frase (.!? + spazio/maiuscola)
 * - Ritorna tra 2 e 4 frasi; se il testo ha 1 frase la ritorna così com'è,
 *   se ne ha >4 ne prende 3 (valore centrale dell'intervallo richiesto)
 */
function summarizeCaption(text: string): string {
  if (!text) return "";
  // Normalizza spazi / newline
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  // Split conservando il delimitatore. Gestisce ". ", "! ", "? " e fine stringa.
  // Usa lookbehind per mantenere il punto.
  const rawSentences = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'\u00C0-\u024F])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSentences.length === 0) return normalized;
  if (rawSentences.length === 1) return rawSentences[0];
  if (rawSentences.length <= 4) return rawSentences.join(" ");

  // >4 frasi: prendi le prime 3 (o 4 se il testo è molto breve per frase)
  // Euristica: se le prime 3 frasi sono < 300 char, prendi 4 per dare più contesto
  const firstThree = rawSentences.slice(0, 3).join(" ");
  if (firstThree.length < 300) {
    return rawSentences.slice(0, 4).join(" ");
  }
  return firstThree;
}

function isFitsUrl(url: string): boolean {
  return /\.fits(\?|$)/i.test(url);
}

function toHubbleError(status: number, message: string, details?: string) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status }
  );
}

/**
 * Calcola distanza in giorni tra due date proiettate sullo stesso anno.
 * Usato per trovare l'immagine Library con date_created più vicina al
 * giorno/mese richiesto (indipendentemente dall'anno).
 * Ritorna differenza assoluta in giorni (0 = stesso giorno/mese).
 */
function dayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function closestByMonthDay(
  items: NasaLibraryItem[],
  requestedDate: Date
): NasaLibraryItem | null {
  if (items.length === 0) return null;

  const reqDay = dayOfYear(requestedDate);
  // Per gestire wrap-around di fine/inizio anno (es. richiesta 01-02 vs immagine 12-31 = distanza 2, non 363)
  // calcoliamo distanza circolare su 366 giorni (anno bisestile safe)
  const YEAR_DAYS = 366;

  let best: NasaLibraryItem | null = null;
  let bestDist = Infinity;

  for (const item of items) {
    const dc = item.data?.[0]?.date_created;
    if (!dc) continue;
    const d = new Date(dc);
    if (Number.isNaN(d.getTime())) continue;
    const itemDay = dayOfYear(d);
    const linear = Math.abs(itemDay - reqDay);
    const circular = Math.min(linear, YEAR_DAYS - linear);
    // Tie-breaker: preferisci date più recenti se stessa distanza? Manteniamo primo trovato.
    if (circular < bestDist) {
      bestDist = circular;
      best = item;
    }
  }
  return best;
}

function extractImageUrl(item: NasaLibraryItem): string | null {
  // Preferisci link con render=image e non-FITS
  const links = item.links ?? [];
  const imageLinks = links.filter(
    (l) => l.render === "image" && !isFitsUrl(l.href)
  );
  if (imageLinks.length > 0) return imageLinks[0].href;
  // Fallback: qualsiasi link non-FITS
  const anyNonFits = links.find((l) => !isFitsUrl(l.href));
  if (anyNonFits) return anyNonFits.href;
  // Ultimo tentativo: links[0]
  if (links.length > 0) return links[0].href;
  return null;
}

// ---------------------------------------------------------------------------
// APOD + Fallback
// ---------------------------------------------------------------------------

async function fetchApod(
  date: string,
  apiKey: string
): Promise<{ ok: boolean; status: number; data?: ApodResponse; errorText?: string }> {
  const url = `${APOD_ENDPOINT}?api_key=${encodeURIComponent(apiKey)}&date=${encodeURIComponent(date)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let json: ApodResponse | null = null;
    try {
      json = text ? (JSON.parse(text) as ApodResponse) : null;
    } catch {
      // risposta non-JSON
    }
    if (!res.ok) {
      return { ok: false, status: res.status, data: json ?? undefined, errorText: text.slice(0, 500) };
    }
    return { ok: true, status: res.status, data: json ?? undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 503, errorText: msg };
  }
}

async function fetchLibrary(
  year: string
): Promise<{ ok: boolean; status: number; data?: NasaLibrarySearchResponse; errorText?: string }> {
  // Query ampia: cerchiamo Hubble + Webb; il filtro anno restringe già molto.
  // Usiamo q=Hubble Space Telescope come da specifica "Hubble/Webb".
  // Se non trova risultati, il caller può tentare con query alternativa.
  const queries = [
    `q=${encodeURIComponent("Hubble Space Telescope")}&media_type=image&year_start=${year}&year_end=${year}`,
    `q=${encodeURIComponent("Hubble")}&media_type=image&year_start=${year}&year_end=${year}`,
    `q=${encodeURIComponent("James Webb")}&media_type=image&year_start=${year}&year_end=${year}`,
  ];

  let lastError: { status: number; text: string } | null = null;

  for (const qs of queries) {
    const url = `${LIBRARY_ENDPOINT}?${qs}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      let json: NasaLibrarySearchResponse | null = null;
      try {
        json = text ? (JSON.parse(text) as NasaLibrarySearchResponse) : null;
      } catch {
        // non-JSON
      }
      if (!res.ok) {
        lastError = { status: res.status, text: text.slice(0, 500) };
        // 429/403 vanno propagati, non tentare altre query
        if (res.status === 429 || res.status === 403) {
          return { ok: false, status: res.status, errorText: text.slice(0, 500) };
        }
        continue; // prova query successiva
      }
      // Se ha risultati, ritorna subito
      if (json?.collection?.items && json.collection.items.length > 0) {
        return { ok: true, status: res.status, data: json };
      }
      // Altrimenti prova query successiva (magari Webb ha risultati dove Hubble no)
      // salva comunque l'ultimo risultato vuoto per eventuale ritorno
      if (json) {
        // Se è l'ultima query, ritorna anche se vuoto così il caller gestisce 404
        // Altrimenti continua
        if (qs === queries[queries.length - 1]) {
          return { ok: true, status: res.status, data: json };
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = { status: 503, text: msg };
      continue;
    }
  }

  if (lastError) {
    return { ok: false, status: lastError.status, errorText: lastError.text };
  }
  return { ok: false, status: 404, errorText: "Nessun risultato dalla NASA Image Library" };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");

  // 1) Validazione presenza
  if (!dateParam) {
    return toHubbleError(400, "Parametro 'date' mancante. Usa ?date=YYYY-MM-DD");
  }

  // 2) Formato
  if (!isValidDateFormat(dateParam)) {
    return toHubbleError(400, "Formato data non valido. Usa YYYY-MM-DD");
  }

  const requestedDate = parseDateUTC(dateParam);
  if (!requestedDate) {
    return toHubbleError(400, "Data non valida (giorno o mese inesistente)");
  }

  // 3) Range 1995-06-16 -> oggi
  if (requestedDate < MIN_DATE) {
    return toHubbleError(
      400,
      `Data precedente al limite APOD. La data minima è ${MIN_DATE_STR}`
    );
  }

  const today = todayUTCDate();
  if (requestedDate > today) {
    return toHubbleError(
      400,
      `Data futura non valida. La data massima è ${todayUTCString()}`
    );
  }

  const apiKey = process.env.NASA_API_KEY
    ? process.env.NASA_API_KEY
    : process.env.NODE_ENV === "production"
      ? null
      : DEMO_KEY;

  if (!apiKey) {
    return toHubbleError(
      503,
      "NASA_API_KEY non configurata. Imposta la variabile d'ambiente NASA_API_KEY su Vercel (Project Settings → Environment Variables) e ridistribuisci.",
      "Missing NASA_API_KEY in production"
    );
  }

  const requestedYear = dateParam.slice(0, 4);

  // -----------------------------------------------------------------------
  // Tentativo APOD primario
  // -----------------------------------------------------------------------
  const apodResult = await fetchApod(dateParam, apiKey);

  // Gestione errori APOD che devono essere propagati direttamente
  if (!apodResult.ok) {
    const status = apodResult.status;

    // 429 / 403 -> messaggi dedicati, non esporre dettagli chiave
    if (status === 429) {
      return toHubbleError(
        429,
        "Troppe richieste alla NASA API (rate limit). Riprova più tardi.",
        "APOD 429"
      );
    }
    if (status === 403) {
      // 403 su APOD spesso = chiave non valida o bloccata
      return toHubbleError(
        503,
        "Servizio NASA temporaneamente non disponibile (accesso negato). Riprova più tardi.",
        "APOD 403"
      );
    }

    // Per altri errori (404, 500, 503) -> prova fallback invece di fallire subito
    // ma se il fallback fallisce, ritorneremo errore appropriato sotto
    // Logica: non ritornare subito, lascia procedere al fallback
  }

  // Se APOD ha successo e media_type è image + url utilizzabile -> ritorna APOD
  if (apodResult.ok && apodResult.data) {
    const apod = apodResult.data;

    // APOD può rispondere con error object anche con 200? Controllo code/msg
    if (apod.code || apod.msg || (apod as unknown as { error?: unknown }).error) {
      // Tratta come errore -> vai a fallback
    } else if (apod.media_type === "image" && apod.url && !isFitsUrl(apod.url)) {
      const imageUrl = apod.url;
      const hdImageUrl =
        apod.hdurl && apod.hdurl !== imageUrl && !isFitsUrl(apod.hdurl)
          ? apod.hdurl
          : undefined;

      const caption = summarizeCaption(apod.explanation || apod.title || "");

      const response: HubbleResponse = {
        imageUrl,
        ...(hdImageUrl ? { hdImageUrl } : {}),
        title: apod.title || "NASA Astronomy Picture of the Day",
        caption: caption || apod.title || "Immagine astronomica del giorno.",
        source: "NASA APOD",
        creditedTo: apod.copyright?.trim() || "NASA",
        actualDate: apod.date || dateParam,
        requestedDate: dateParam,
        isFallback: false,
        mediaType: "image",
      };

      return NextResponse.json(response, { status: 200 });
    }
    // Altrimenti media_type !== "image" (video) o url FITS -> cadi in fallback
  }

  // -----------------------------------------------------------------------
  // Fallback: NASA Image Library
  // -----------------------------------------------------------------------
  const libraryResult = await fetchLibrary(requestedYear);

  if (!libraryResult.ok) {
    const status = libraryResult.status;
    if (status === 429) {
      return toHubbleError(
        429,
        "Troppe richieste alla NASA Image Library. Riprova più tardi."
      );
    }
    if (status === 403) {
      return toHubbleError(
        503,
        "Servizio NASA Image Library temporaneamente non disponibile. Riprova più tardi."
      );
    }
    // Se APOD aveva già fallito, dai un errore composito
    const apodMsg = apodResult.ok
      ? "APOD non contiene un'immagine per questa data"
      : `APOD non disponibile (status ${apodResult.status})`;
    return toHubbleError(
      502,
      `${apodMsg} e il fallback NASA Image Library non ha restituito risultati.`,
      libraryResult.errorText?.slice(0, 300)
    );
  }

  const items = libraryResult.data?.collection.items ?? [];
  if (items.length === 0) {
    return toHubbleError(
      404,
      "Nessuna immagine trovata nella NASA Image Library per l'anno richiesto.",
      `year=${requestedYear}`
    );
  }

  const best = closestByMonthDay(items, requestedDate) ?? items[0];
  const bestData = best.data?.[0];

  if (!bestData) {
    return toHubbleError(502, "Risposta NASA Image Library malformata (data mancante).");
  }

  const imageUrl = extractImageUrl(best);
  if (!imageUrl) {
    return toHubbleError(502, "Nessun URL immagine valido trovato nel risultato NASA Image Library.");
  }

  // hdImageUrl: prova a prendere il link con maggiore qualità se disponibile;
  // images-api non dà direttamente hd, ma href contiene asset manifest; usiamo lo stesso imageUrl
  // e tentiamo di non duplicare se identico
  const hdImageUrl = undefined; // Library non distingue HD nello stesso modo di APOD

  const rawDescription =
    bestData.description || bestData.description_508 || bestData.title || "";
  const caption = summarizeCaption(rawDescription);

  // actualDate da date_created (tronca a YYYY-MM-DD)
  let actualDate = dateParam; // fallback
  try {
    const dc = new Date(bestData.date_created);
    if (!Number.isNaN(dc.getTime())) {
      actualDate = dc.toISOString().slice(0, 10);
    }
  } catch {
    // ignora
  }

  const creditedTo =
    bestData.photographer?.trim() ||
    bestData.secondary_creator?.trim() ||
    bestData.center?.trim() ||
    "NASA / Hubble Space Telescope";

  const hasHubbleKeyword = (bestData.keywords ?? []).some((k) =>
    /hubble/i.test(k)
  );
  const source = hasHubbleKeyword
    ? "NASA Image Library — Hubble Space Telescope"
    : "NASA Image Library — Hubble Space Telescope";

  const response: HubbleResponse = {
    imageUrl,
    ...(hdImageUrl ? { hdImageUrl } : {}),
    title: bestData.title || "Hubble Space Telescope Image",
    caption: caption || bestData.title || "Immagine dal telescopio Hubble.",
    source,
    creditedTo,
    actualDate,
    requestedDate: dateParam,
    isFallback: true,
    mediaType: "image",
  };

  return NextResponse.json(response, { status: 200 });
}
