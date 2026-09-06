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
    const caseRes = await (await this.database()).db.select().from((await this.database()).cases).where(eq((await this.database()).cases.caseId, caseId));
    if (caseRes.length === 0) return undefined;
    
    const [c] = caseRes;
    const allRulings = await (await this.database()).db.select().from((await this.database()).rulings).where(eq((await this.database()).rulings.caseId, caseId));
    
    const sortedRulings = allRulings.map(r => r.data as unknown as Ruling).sort((a, b) => b.revision - a.revision);
    
    return {
      ...(c.data as Record<string, unknown>),
      currentRuling: sortedRulings.length > 0 ? sortedRulings[0] : undefined,
      previousRulings: sortedRulings.length > 1 ? sortedRulings.slice(1) : []
    } as ClaimCaseBundle;
  }

  async listCases(): Promise<ClaimCaseBundle[]> {
    const allCases = await (await this.database()).db.select().from((await this.database()).cases);
    const results: ClaimCaseBundle[] = [];
    for (const c of allCases) {
       const full = await this.fetchFullCase(c.caseId);
       if (full) results.push(full);
    }
    return results;
  }

  async getCase(caseId: string): Promise<ClaimCaseBundle | undefined> {
    return this.fetchFullCase(caseId);
  }

  async getRuling(rulingId: string): Promise<{ bundle: ClaimCaseBundle; ruling: Ruling } | undefined> {
     const rulingRes = await (await this.database()).db.select().from((await this.database()).rulings).where(eq((await this.database()).rulings.rulingId, rulingId));
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
