import "server-only";
import type { ProgressEvent, ScrapeCriteria, ScrapedOffre, Scraper } from "./base";
import { htmlToText } from "./base";
import { nameToCode, normalizeCountryName } from "@/lib/countries";
import { detectVie } from "@/lib/vie";
import { sleep } from "./dom";

const SOURCE = "freework";
const API = "https://api.free-work.com/job_postings";
const PAGE_SIZE = 50;
const PAGES_PER_QUERY = 3;

type Posting = {
  id: number;
  slug: string;
  title: string;
  company?: { name?: string | null } | null;
  job?: { slug?: string | null } | null;
  location?: { label?: string | null; countryCode?: string | null; country?: string | null } | null;
  description?: string | null;
  candidateProfile?: string | null;
  publishedAt?: string | null;
  status?: string | null;
  contracts?: string[] | null;
  minAnnualSalary?: number | null;
  maxAnnualSalary?: number | null;
  minDailySalary?: number | null;
  maxDailySalary?: number | null;
  currency?: string | null;
};

const CONTRACTS: Record<string, string> = {
  permanent: "CDI",
  "fixed-term": "CDD",
  contractor: "Freelance",
  apprenticeship: "Alternance",
  internship: "Stage",
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Free-Work HTTP ${res.status}`);
  return res.json();
}

function salary(posting: Posting): string | null {
  const annual = posting.minAnnualSalary != null || posting.maxAnnualSalary != null;
  const min = annual ? posting.minAnnualSalary : posting.minDailySalary;
  const max = annual ? posting.maxAnnualSalary : posting.maxDailySalary;
  if (min == null && max == null) return null;
  const amount = min != null && max != null && min !== max ? `${min}–${max}` : String(min ?? max);
  const period = annual ? "an" : "jour";
  return `${amount}${posting.currency ? ` ${posting.currency}` : ""} / ${period}`;
}

function toOffre(posting: Posting): ScrapedOffre {
  const slug = encodeURIComponent(posting.slug);
  const family = encodeURIComponent(posting.job?.slug || "emploi");
  const url = `https://www.free-work.com/fr/tech-it/job-mission/${family}/${slug}`;
  const description = posting.description?.trim() ?? "";
  const profile = posting.candidateProfile?.trim() ?? "";
  const description_html = description + (profile && !description.includes(profile) ? `<h2>Profil recherché</h2>${profile}` : "");
  const description_text = htmlToText(description_html);
  const country = normalizeCountryName(posting.location?.countryCode || posting.location?.country);
  return {
    source_id: String(posting.id),
    url,
    title: posting.title.trim(),
    company: posting.company?.name?.trim() ?? "",
    country,
    location: posting.location?.label ?? null,
    contract_type: posting.contracts?.map((c) => CONTRACTS[c] ?? c).join(", ") || null,
    salary: salary(posting),
    description_html,
    description_text,
    description_status: description_text.length >= 100 ? "ok" : "failed",
    posted_at: posting.publishedAt?.slice(0, 10) ?? null,
    is_vie: detectVie({ source: SOURCE, title: posting.title, description: description_text, url }),
    raw_payload: { id: posting.id, slug: posting.slug },
    scrape_errors: description_text.length >= 100 ? undefined : "description introuvable",
  };
}

export const freeworkScraper: Scraper = {
  name: SOURCE,
  async *scrape(criteria: ScrapeCriteria, onEvent: (e: ProgressEvent) => void) {
    onEvent({ kind: "start", source: SOURCE });
    const max = Math.max(0, criteria.maxOffres ?? 50);
    const countries = new Set(criteria.countries.map(nameToCode).filter((c): c is string => !!c));
    const found = new Map<number, Posting>();
    for (const query of criteria.sectors.length ? criteria.sectors : [""]) {
      const seen = new Set<number>();
      for (let page = 1; page <= PAGES_PER_QUERY && found.size < max; page++) {
        const params = new URLSearchParams({ page: String(page), itemsPerPage: String(PAGE_SIZE) });
        if (query.trim()) params.set("searchKeywords", query.trim());
        const data = await getJson(`${API}?${params}`);
        if (!Array.isArray(data)) throw new Error("Free-Work : réponse de recherche inattendue");
        let fresh = 0;
        for (const item of data as Posting[]) {
          if (!item || !Number.isSafeInteger(item.id) || !item.slug || !item.title || seen.has(item.id)) continue;
          seen.add(item.id);
          fresh++;
          const code = item.location?.countryCode?.toUpperCase() || nameToCode(normalizeCountryName(item.location?.country));
          if (countries.size && code && !countries.has(code)) continue;
          if (!found.has(item.id)) found.set(item.id, item);
          if (found.size >= max) break;
        }
        if (data.length < PAGE_SIZE || fresh === 0) break;
        await sleep(1000);
      }
      if (found.size >= max) break;
    }

    const postings = [...found.values()];
    onEvent({ kind: "list", source: SOURCE, total: postings.length });
    let ok = 0;
    let failed = 0;
    let lastError = "";
    let answered = 0;
    for (let i = 0; i < postings.length; i++) {
      try {
        const data = await getJson(`${API}/${encodeURIComponent(postings[i].slug)}`);
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("réponse de détail inattendue");
        answered++;
        const detail = data as Partial<Posting>;
        if (!detail.status || detail.status === "published") {
          const offre = toOffre({ ...postings[i], ...detail });
          yield offre;
          if (offre.description_status === "ok") ok++;
          else failed++;
          onEvent({ kind: "offre", source: SOURCE, index: i + 1, total: postings.length, status: offre.description_status === "ok" ? "ok" : "failed" });
        } else {
          failed++;
          onEvent({ kind: "offre", source: SOURCE, index: i + 1, total: postings.length, status: "failed" });
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        failed++;
        onEvent({ kind: "offre", source: SOURCE, index: i + 1, total: postings.length, status: "failed" });
      }
      if (i + 1 < postings.length) await sleep(1000);
    }
    if (postings.length && !answered) throw new Error(`Free-Work : détails indisponibles (${lastError})`);
    onEvent({ kind: "done", source: SOURCE, seen: postings.length, ok, failed });
  },
};
