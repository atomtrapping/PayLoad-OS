import { db } from '../src/db';
import { corpora, releases, records, retractions, cases, rulings } from '../src/db/schema';
import { FIXTURE_CORPORA, FIXTURE_CASES } from '../src/fixtures';

async function seed() {
  console.log('Seeding database with fixtures...');
  
  for (const corpus of FIXTURE_CORPORA) {
    const { releases: corpusReleases, records: corpusRecords, retractions: corpusRetractions, ...corpusData } = corpus;
    
    await db.insert(corpora).values({
      corpusId: corpus.corpusId,
      domain: corpus.domain,
      title: corpus.title,
      description: corpus.description,
      data: corpusData as unknown as Record<string, unknown>,
    }).onConflictDoNothing();
    
    for (const release of corpusReleases) {
      await db.insert(releases).values({
        releaseId: release.releaseId,
        corpusId: corpus.corpusId,
        status: release.status,
        knownAt: release.knownAt,
        data: release as unknown as Record<string, unknown>,
      }).onConflictDoNothing();
    }
    
    for (const record of corpusRecords) {
      await db.insert(records).values({
        recordId: record.recordId,
        corpusId: corpus.corpusId,
        subjectId: record.subjectId,
        predicate: record.predicate,
        validFrom: record.validFrom,
        validTo: record.validTo || null,
        knownAt: record.knownAt,
        // These fixtures never crossed the admission gate, and the entry
        // stamp says so rather than inventing one. Source time and
        // acquisition time are the record's own knowledge time because
        // nothing acquired them: they were committed. A row seeded here is
        // a demonstration, and no query may read it as admitted state.
        sourceTime: record.knownAt,
        acquisitionTime: record.knownAt,
        provenance: 'DEMONSTRATION',
        data: record as unknown as Record<string, unknown>,
      }).onConflictDoNothing();
    }
    
    for (const retraction of corpusRetractions) {
      await db.insert(retractions).values({
        retractionId: retraction.retractionId,
        corpusId: corpus.corpusId,
        issuedAt: retraction.issuedAt,
        data: retraction as unknown as Record<string, unknown>,
      }).onConflictDoNothing();
    }
  }

  for (const c of FIXTURE_CASES) {
    const { currentRuling, previousRulings, ...caseData } = c;
    
    await db.insert(cases).values({
      caseId: c.caseId,
      status: c.status,
      lastChangedAt: c.lastChangedAt,
      data: caseData as unknown as Record<string, unknown>,
    }).onConflictDoNothing();
    
    const allRulings = [];
    if (currentRuling) allRulings.push(currentRuling);
    if (previousRulings) allRulings.push(...previousRulings);
    
    for (const ruling of allRulings) {
      await db.insert(rulings).values({
        rulingId: ruling.rulingId,
        caseId: c.caseId,
        status: ruling.status,
        ruledAt: ruling.temporalBasis?.ruledAt || new Date().toISOString(),
        data: ruling as unknown as Record<string, unknown>,
      }).onConflictDoNothing();
    }
  }
  
  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
