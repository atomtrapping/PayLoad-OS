import { deliverableRecords, releaseRecords, LOCATION_POSITION_PREDICATE, type Corpus, type CorpusRecord, type CorpusRelease } from '@/domain/corpus';

/** The only record metadata the Earth page serializes into its client selector. */
export type EarthRecordChoice = Pick<CorpusRecord, 'recordId' | 'title' | 'subjectId' | 'predicate' | 'validFrom' | 'validTo'> & {
  /**
   * The release declares a position record for this record's subject.
   *
   * A hint for choosing which record to ask about first, and nothing more. It
   * says a position record exists for the subject, not that the compiler will
   * place this record: the compiler still decides, on the exact version, at the
   * asked-for clocks, under the viewer's rights. A twin that treated this as a
   * promise would be answering the placement question in the selector.
   */
  positionDeclared: boolean;
};

/**
 * Server-side choices for the twin's fixed COUNTERPARTY_SHARED viewer. Reuse
 * the corpus delivery/visibility gate before projecting any metadata; never
 * return its withheld counts, reasons, identifiers, or the underlying records.
 * Historical corrected/retracted records remain selectable, as in the
 * projection compiler. This list grants neither geometry nor current truth:
 * the exact-version compiler still decides each selected realization.
 */
export function earthRecordChoices(corpus: Corpus, release: CorpusRelease): EarthRecordChoice[] {
  // Subjects the release positions at all. Read from the whole release rather
  // than from the deliverable set, because a position withheld from this viewer
  // is still a position the release declares — and the compiler, not this list,
  // is where that withholding is decided and stated.
  const positioned = new Set(
    releaseRecords(corpus, release)
      .filter((record) => record.predicate === LOCATION_POSITION_PREDICATE)
      .map((record) => record.subjectCanonicalId),
  );
  return deliverableRecords(corpus, release, 'COUNTERPARTY_SHARED').records.map((record) => ({
    positionDeclared: positioned.has(record.subjectCanonicalId),
    recordId: record.recordId,
    title: record.title,
    subjectId: record.subjectId,
    predicate: record.predicate,
    validFrom: record.validFrom,
    ...(record.validTo === undefined ? {} : { validTo: record.validTo }),
  }));
}
