/**
 * The adapter boundary.
 */
import type { AdmissionProfile, ClaimCaseBundle, Remediation, Ruling } from '@/domain/types';
import { FIXTURE_CASES, FIXTURE_PROFILES, FIXTURE_REMEDIATIONS } from '@/fixtures';
import { allRulings } from '@/domain/selectors';
import { eq } from 'drizzle-orm';
import { corpusDatabaseConfigured } from './corpusSource';

export interface CaseSource {
  readonly origin: { kind: 'FIXTURE'; label: string } | { kind: 'LIVE'; label: string };
  listCases(): Promise<ClaimCaseBundle[]>;
  getCase(caseId: string): Promise<ClaimCaseBundle | undefined>;
  getRuling(rulingId: string): Promise<{ bundle: ClaimCaseBundle; ruling: Ruling } | undefined>;
  listProfiles(): Promise<AdmissionProfile[]>;
  getProfile(profileId: string): Promise<AdmissionProfile | undefined>;
  getRemediation(remediationId: string): Promise<Remediation | undefined>;
}

/** Rebuild the ruling history once for both individual and batched reads. */
function withRulings(data: unknown, rulings: readonly Ruling[]): ClaimCaseBundle {
  const sorted = [...rulings].sort((a, b) => b.revision - a.revision);
  return {
    ...(data as Record<string, unknown>),
    currentRuling: sorted[0],
    previousRulings: sorted.slice(1),
  } as ClaimCaseBundle;
}

export class FixtureCaseSource implements CaseSource {
  readonly origin = { kind: 'FIXTURE', label: 'Demonstration fixtures (fixture_only: true)' } as const;

  async listCases(): Promise<ClaimCaseBundle[]> {
    return [...FIXTURE_CASES];
  }

  async getCase(caseId: string): Promise<ClaimCaseBundle | undefined> {
    return FIXTURE_CASES.find((c) => c.caseId === caseId);
  }

  async getRuling(rulingId: string): Promise<{ bundle: ClaimCaseBundle; ruling: Ruling } | undefined> {
    for (const bundle of FIXTURE_CASES) {
      const ruling = allRulings(bundle).find((r) => r.rulingId === rulingId);
      if (ruling) return { bundle, ruling };
    }
    return undefined;
  }

  async listProfiles(): Promise<AdmissionProfile[]> {
    return [...FIXTURE_PROFILES];
  }

  async getProfile(profileId: string): Promise<AdmissionProfile | undefined> {
    return FIXTURE_PROFILES.find((p) => p.profileId === profileId);
  }

  async getRemediation(remediationId: string): Promise<Remediation | undefined> {
    return FIXTURE_REMEDIATIONS[remediationId];
  }
}

export class LiveCaseSource implements CaseSource {
  readonly origin = { kind: 'LIVE', label: 'Live Cloud SQL Workbench' } as const;

  /** Loaded on demand: the fixture path must not pull the driver into a bundle. */
  private async database() {
    const [{ db }, schema] = await Promise.all([import('@/db'), import('@/db/schema')]);
    return { db, ...schema };
  }

  private async fetchFullCase(caseId: string): Promise<ClaimCaseBundle | undefined> {
    const { db, cases, rulings } = await this.database();
    const caseRes = await db.select().from(cases).where(eq(cases.caseId, caseId));
    if (caseRes.length === 0) return undefined;
    const rows = await db.select().from(rulings).where(eq(rulings.caseId, caseId));
    return withRulings(caseRes[0].data, rows.map((row: any) => row.data as Ruling));
  }

  async listCases(): Promise<ClaimCaseBundle[]> {
    const { db, cases, rulings } = await this.database();
    const allCases = await db.select().from(cases);
    if (!allCases.length) return [];
    const rows = await db.select().from(rulings);
    const histories = new Map<string, Ruling[]>();
    for (const row of (rows as any[])) {
      const history = histories.get(row.caseId) ?? [];
      history.push(row.data as Ruling);
      histories.set(row.caseId, history);
    }
    return allCases.map((entry: any) => withRulings(entry.data, histories.get(entry.caseId) ?? []));
  }

  async getCase(caseId: string): Promise<ClaimCaseBundle | undefined> {
    return this.fetchFullCase(caseId);
  }

  async getRuling(rulingId: string): Promise<{ bundle: ClaimCaseBundle; ruling: Ruling } | undefined> {
     const { db, rulings } = await this.database();
     const rulingRes = await db.select().from(rulings).where(eq(rulings.rulingId, rulingId));
     if (rulingRes.length === 0) return undefined;
     
     const bundle = await this.fetchFullCase(rulingRes[0].caseId);
     if (!bundle) return undefined;
     
     const ruling = allRulings(bundle).find((r) => r.rulingId === rulingId);
     if (!ruling) return undefined;
     
     return { bundle, ruling };
  }

  async listProfiles(): Promise<AdmissionProfile[]> {
    return [...FIXTURE_PROFILES];
  }

  async getProfile(profileId: string): Promise<AdmissionProfile | undefined> {
    return FIXTURE_PROFILES.find((p) => p.profileId === profileId);
  }

  async getRemediation(remediationId: string): Promise<Remediation | undefined> {
    return FIXTURE_REMEDIATIONS[remediationId];
  }
}

let source: CaseSource | undefined;

/** The source the app runs on. */
export function getCaseSource(): CaseSource {
  if (!source) source = corpusDatabaseConfigured() ? new LiveCaseSource() : new FixtureCaseSource();
  return source;
}
