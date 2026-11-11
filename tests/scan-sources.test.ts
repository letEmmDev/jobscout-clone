import { describe, expect, it, vi } from "vitest";
import type { ProgressEvent, Scraper } from "@/lib/scrapers/base";
import { getDb } from "@/lib/db";
import { DEFAULT_SOURCE_IDS } from "@/lib/sources-meta";
import { profile } from "./fixtures";

/**
 * Sources réellement scannées par runScan selon le profil enregistré.
 * Régression visée : un profil sans source (liste vide ou absente) doit
 * retomber sur les sources par défaut, scan quotidien compris — pas scanner
 * zéro source. Les scrapers sont remplacés par des faux qui ne produisent
 * rien : aucun appel réseau, seule la base SQLite temporaire est touchée.
 */

const state = vi.hoisted(() => ({
  sourcesEnabled: null as string[] | null,
}));

vi.mock("@/lib/db/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/queries")>()),
  getProfile: () => ({ ...profile, sources_enabled: state.sourcesEnabled }),
}));

vi.mock("@/lib/scrapers/registry", () => {
  const fake = (id: string): Scraper => ({
    name: id,
    async *scrape(_criteria, onEvent: (e: ProgressEvent) => void) {
      onEvent({ kind: "start", source: id });
      onEvent({ kind: "done", source: id, seen: 0, ok: 0, failed: 0 });
    },
  });
  return {
    VALID_SOURCES: ["wttj", "linkedin", "civiweb", "apec", "hellowork", "francetravail", "talent", "freework"],
    getEnabledScrapers: (ids: string[]) => ids.map(fake),
  };
});

async function scannedSources(opts?: { onlySource?: string }): Promise<string[]> {
  const { runScan } = await import("@/lib/scan/orchestrator");
  const started: string[] = [];
  let done = false;
  for await (const ev of runScan(() => {}, opts)) {
    if (ev.kind === "start") started.push(ev.source);
    if (ev.kind === "global-done") done = true;
  }
  expect(done).toBe(true);
  // Le passage est bien clos en base (sinon « running » à vie).
  const last = getDb().prepare("SELECT status FROM scan_runs ORDER BY id DESC LIMIT 1").get() as { status: string };
  expect(last.status).toBe("done");
  return started;
}

describe("runScan — sources scannées", () => {
  it("profil sans liste (null) : sources par défaut", async () => {
    state.sourcesEnabled = null;
    expect(await scannedSources()).toEqual(DEFAULT_SOURCE_IDS);
  });

  it("profil avec liste vide : sources par défaut", async () => {
    state.sourcesEnabled = [];
    expect(await scannedSources()).toEqual(DEFAULT_SOURCE_IDS);
  });

  it("profil avec des sources cochées : exactement celles-là", async () => {
    state.sourcesEnabled = ["apec", "linkedin"];
    expect(await scannedSources()).toEqual(["apec", "linkedin"]);
  });

  it("source imposée : elle seule, quel que soit le profil", async () => {
    state.sourcesEnabled = [];
    expect(await scannedSources({ onlySource: "talent" })).toEqual(["talent"]);
  });

  it("les sources par défaut excluent LinkedIn (moteur à télécharger) et Civiweb (suspendue)", () => {
    expect(DEFAULT_SOURCE_IDS.length).toBeGreaterThan(0);
    expect(DEFAULT_SOURCE_IDS).not.toContain("linkedin");
    expect(DEFAULT_SOURCE_IDS).not.toContain("civiweb");
  });
});
