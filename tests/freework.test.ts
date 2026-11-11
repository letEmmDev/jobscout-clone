import { afterEach, describe, expect, it, vi } from "vitest";
import { freeworkScraper } from "@/lib/scrapers/freework";
import { SOURCE_IDS } from "@/lib/sources-meta";
import { VALID_SOURCES } from "@/lib/scrapers/registry";
import type { ProgressEvent, ScrapedOffre } from "@/lib/scrapers/base";

vi.mock("@/lib/scrapers/dom", () => ({ sleep: async () => {} }));

afterEach(() => vi.unstubAllGlobals());

const card = {
  id: 123,
  slug: "developpeur-example",
  title: "Développeur",
  company: { name: "Example" },
  location: { label: "Paris", countryCode: "FR" },
};

async function scan(sectors = ["Java"], countries = ["France"]) {
  const events: ProgressEvent[] = [];
  const offres: ScrapedOffre[] = [];
  for await (const offre of freeworkScraper.scrape({ sectors, countries }, (event) => events.push(event))) {
    offres.push(offre);
  }
  return { offres, events };
}

describe("Free-Work", () => {
  it("is registered wherever sources are selectable", () => {
    expect(VALID_SOURCES).toEqual(SOURCE_IDS);
  });

  it("searches by sector, deduplicates results and builds a direct application link", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/job_postings") {
        expect(url.searchParams.get("searchKeywords")).toBeTruthy();
        return Response.json([card, card, { ...card, id: 2, slug: "other", location: { countryCode: "GB" } }]);
      }
      return Response.json({
        ...card,
        job: { slug: "developpeur" },
        status: "published",
        description: `<p>${"Description de la mission. ".repeat(6)}</p>`,
        candidateProfile: "<p>Profil expérimenté.</p>",
        contracts: ["contractor", "permanent"],
        maxAnnualSalary: 70000,
        minDailySalary: 500,
        currency: "EUR",
        publishedAt: "2026-10-28T12:00:00Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { offres, events } = await scan(["Java", "TypeScript"]);
    expect(offres).toHaveLength(1);
    expect(offres[0]).toMatchObject({
      source_id: "123",
      url: "https://www.free-work.com/fr/tech-it/job-mission/developpeur/developpeur-example",
      country: "France",
      contract_type: "Freelance, CDI",
      salary: "70000 EUR / an",
      posted_at: "2026-10-28",
      description_status: "ok",
    });
    expect(offres[0].description_text).toContain("Profil expérimenté");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events.at(-1)).toEqual({ kind: "done", source: "freework", seen: 1, ok: 1, failed: 0 });
  });

  it("continues past pages with no matching countries", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname !== "/job_postings") {
        return Response.json({ ...card, description: "x".repeat(120) });
      }
      return Response.json(url.searchParams.get("page") === "1"
        ? Array.from({ length: 50 }, (_, id) => ({ ...card, id: id + 200, location: { countryCode: "GB" } }))
        : [card]);
    }));
    const { offres } = await scan();
    expect(offres.map((o) => o.source_id)).toEqual(["123"]);
  });

  it("reports listing and detail failures instead of silently returning no offers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(scan()).rejects.toThrow("Free-Work HTTP 503");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) =>
      new URL(String(input)).pathname === "/job_postings"
        ? Response.json([card])
        : new Response("", { status: 503 })));
    await expect(scan()).rejects.toThrow("détails indisponibles");
  });
});
