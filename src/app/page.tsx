"use client";

import { useCallback, useMemo, useState } from "react";

type HubbleResponse = {
  imageUrl: string;
  hdImageUrl?: string;
  title: string;
  caption: string;
  source: string;
  creditedTo: string;
  actualDate: string;
  requestedDate: string;
  isFallback: boolean;
  mediaType: "image";
};

const MIN_DATE = "1995-06-16";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateIT(iso: string): string {
  if (!iso) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function Home() {
  const today = useMemo(() => todayISO(), []);
  const [date, setDate] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [data, setData] = useState<HubbleResponse | null>(null);

  const validate = useCallback(
    (v: string): string | null => {
      if (!v) return "Seleziona una data.";
      if (v < MIN_DATE) return "La data deve essere dal 16 giugno 1995 in poi (prime immagini Hubble).";
      if (v > today) return "La data non può essere nel futuro.";
      return null;
    },
    [today]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const err = validate(date);
      if (err) {
        setValidationError(err);
        return;
      }
      setValidationError(null);
      setApiError(null);
      setLoading(true);
      setData(null);
      try {
        const res = await fetch(`/api/hubble?date=${encodeURIComponent(date)}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || `Errore ${res.status}`);
        }
        // valida forma minima
        if (!json.imageUrl || !json.title) {
          throw new Error("Risposta incompleta dal server.");
        }
        setData(json as HubbleResponse);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Errore imprevisto.";
        setApiError(msg);
      } finally {
        setLoading(false);
      }
    },
    [date, validate]
  );

  const onDateChange = (v: string) => {
    setDate(v);
    if (validationError) setValidationError(validate(v));
    if (apiError) setApiError(null);
  };

  return (
    <div className="min-h-screen bg-[#020610] text-zinc-100 selection:bg-violet-500/30 flex flex-col">
      {/* bg decor */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[#020610]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_800px_500px_at_50%_-10%,rgba(120,90,255,0.18),transparent_70%),radial-gradient(ellipse_600px_400px_at_90%_20%,rgba(56,189,248,0.12),transparent_60%),radial-gradient(ellipse_700px_500px_at_10%_30%,rgba(168,85,247,0.10),transparent_60%)]" />
        {/* stars */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(1px_1px_at_20%_30%,white,transparent),radial-gradient(1px_1px_at_40%_70%,white,transparent),radial-gradient(0.7px_0.7px_at_65%_20%,white,transparent),radial-gradient(0.9px_0.9px_at_85%_50%,white,transparent),radial-gradient(1px_1px_at_10%_80%,white,transparent),radial-gradient(0.8px_0.8px_at_55%_85%,white,transparent),radial-gradient(1px_1px_at_75%_75%,white,transparent)",
          }}
        />
      </div>

      {/* header */}
      <header className="mx-auto w-full max-w-5xl px-5 sm:px-6 pt-8 sm:pt-10">
        <nav className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#020610] text-[13px] font-bold tracking-tight"
            >
              ◐
            </span>
            <span className="text-sm font-medium tracking-widest uppercase text-zinc-300">
              Hubble Compleanno
            </span>
          </div>
          <span className="hidden sm:inline text-xs text-zinc-500">
            Dati NASA / Space Telescope Science Institute
          </span>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 sm:px-6 pb-12 pt-8 sm:pt-12">
        {/* hero */}
        <div className="max-w-3xl">
          <h1 className="text-[28px] sm:text-[42px] font-semibold leading-[1.05] tracking-tight">
            Cosa ha visto <span className="bg-gradient-to-r from-violet-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">Hubble</span>
            <br />
            il giorno del tuo compleanno?
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-6 text-zinc-400">
            Inserisci la tua data di nascita — ti mostriamo l&apos;immagine catturata dal telescopio spaziale Hubble in quel giorno. Dal 16 giugno 1995 a oggi.
          </p>
        </div>

        {/* form card */}
        <section
          aria-labelledby="form-title"
          className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_16px_60px_rgba(0,0,0,0.5)] overflow-hidden"
        >
          <div className="p-5 sm:p-7">
            <h2 id="form-title" className="sr-only">
              Cerca per data di nascita
            </h2>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                <div className="flex-1">
                  <label htmlFor="birthdate" className="block text-sm font-medium text-zinc-200 mb-1.5">
                    Data di nascita
                  </label>
                  <input
                    id="birthdate"
                    name="birthdate"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => onDateChange(e.target.value)}
                    min={MIN_DATE}
                    max={today}
                    aria-invalid={!!validationError}
                    aria-describedby={validationError ? "date-error" : "date-help"}
                    className="w-full rounded-xl border border-white/15 bg-[#0b1020] px-3.5 py-3 text-[15px] text-white placeholder:text-zinc-500 shadow-inner outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/20 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70"
                  />
                  <p id="date-help" className="mt-1.5 text-xs text-zinc-500">
                    Intervallo consentito: 16/06/1995 — {formatDateIT(today)} (oggi)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-[#0b1020] shadow hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 disabled:opacity-60 disabled:cursor-not-allowed transition sm:min-w-[148px]"
                >
                  {loading ? (
                    <>
                      <span
                        aria-hidden
                        className="h-4 w-4 animate-spin rounded-full border-2 border-[#0b1020]/30 border-t-[#0b1020]"
                      />
                      Caricamento…
                    </>
                  ) : (
                    <>
                      <span aria-hidden>✦</span> Scopri Hubble
                    </>
                  )}
                </button>
              </div>

              {validationError && (
                <p id="date-error" role="alert" className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-300">
                  {validationError}
                </p>
              )}
            </form>
          </div>

          {/* status area */}
          <div aria-live="polite" aria-atomic="true" className="border-t border-white/10">
            {loading && (
              <div className="flex items-center gap-3 px-5 sm:px-7 py-6 text-sm text-zinc-400">
                <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                Sto interrogando l&apos;archivio Hubble per il {date ? formatDateIT(date) : "…"}…
              </div>
            )}

            {apiError && !loading && (
              <div role="alert" className="mx-5 sm:mx-7 my-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3">
                <p className="text-sm font-medium text-red-300">Impossibile caricare l&apos;immagine</p>
                <p className="mt-1 text-sm leading-5 text-red-200/80">{apiError}</p>
                <p className="mt-2 text-xs text-red-200/60">Riprova con un&apos;altra data o ricarica la pagina.</p>
              </div>
            )}

            {!loading && !apiError && !data && (
              <div className="px-5 sm:px-7 py-6 flex items-center gap-3 text-sm text-zinc-500">
                <span aria-hidden className="text-base">◎</span>
                Seleziona una data e premi “Scopri Hubble” per vedere la tua immagine.
              </div>
            )}
          </div>
        </section>

        {/* risultato */}
        {data && !loading && (
          <section
            aria-labelledby="result-title"
            className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_16px_60px_rgba(0,0,0,0.5)]"
          >
            {/* image */}
            <div className="relative bg-black">
              {/* subtle top bar with badge */}
              <div className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center gap-2 p-3 sm:p-4">
                <span className="inline-flex items-center rounded-full bg-black/60 backdrop-blur px-2.5 py-1 text-xs font-medium text-white border border-white/15">
                  {formatDateIT(data.actualDate)} • {data.source || "Hubble Space Telescope"}
                </span>
                {data.isFallback && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-semibold text-black">
                    <span aria-hidden>◐</span> Data diversa dalla richiesta
                  </span>
                )}
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.hdImageUrl || data.imageUrl}
                alt={data.title}
                width={1200}
                height={800}
                className="h-auto max-h-[68vh] w-full object-contain object-center"
                loading="eager"
              />
            </div>

            {/* meta */}
            <div className="p-5 sm:p-7">
              <h2 id="result-title" className="text-xl sm:text-2xl font-semibold leading-tight tracking-tight text-white">
                {data.title}
              </h2>

              <p className="mt-3 text-[15px] leading-6 text-zinc-300">{data.caption}</p>

              <dl className="mt-6 grid gap-3 rounded-xl bg-black/30 border border-white/10 p-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-widest text-zinc-500">Fonte / Telescopio</dt>
                  <dd className="mt-1 text-sm font-medium text-zinc-200">{data.source}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-zinc-500">Credito</dt>
                  <dd className="mt-1 text-sm font-medium text-zinc-200">{data.creditedTo}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-zinc-500">Data richiesta</dt>
                  <dd className="mt-1 text-sm font-medium text-zinc-200">{formatDateIT(data.requestedDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-zinc-500">Data reale dell&apos;osservazione</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-200">
                    {formatDateIT(data.actualDate)}
                    {data.isFallback && (
                      <span className="rounded-full bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 text-xs font-semibold text-amber-300">
                        fallback
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              {data.isFallback && (
                <p className="mt-3 text-xs leading-5 text-amber-200/80">
                  Nessuna immagine disponibile esattamente il {formatDateIT(data.requestedDate)} — ti mostriamo l&apos;osservazione più vicina del{" "}
                  {formatDateIT(data.actualDate)}.
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href={data.hdImageUrl || data.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b1020] hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 transition"
                >
                  Apri HD
                  <span aria-hidden>↗</span>
                </a>
                <a
                  href={data.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 transition"
                >
                  Immagine standard
                </a>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-8 text-center text-xs leading-5 text-zinc-600">
          <p>
            Progetto didattico — immagini e testi provengono da NASA / STScI. Le date antecedenti il 16/06/1995 non sono disponibili perché Hubble è stato
            lanciato il 24 aprile 1990 e le prime immagini calibrate risalgono al 1995.
          </p>
        </footer>
      </main>
    </div>
  );
}
