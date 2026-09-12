/**
 * Dossier delivery, in the database.
 *
 * `src/domain/dossierService.ts` states the contract. This is where the
 * expensive mistakes stop depending on anyone remembering it.
 *
 * THE RECIPIENT IS A FREE COLUMN ON PURPOSE
 *
 * A first draft of this schema determined the recipient once, on the spec, and
 * let every table below inherit it. That is tidier and it is useless: if a
 * delivery cannot name a recipient of its own, then delivering customer A's
 * dossier to customer B is not a row the schema can represent — and a failure
 * that cannot be represented cannot be refused, cannot be tested, and will
 * eventually happen in application code where no constraint is looking.
 *
 * So `dossier_delivery` carries its own recipient, tied to the release's by a
 * composite key. The wrong recipient is a row somebody can write, and it is a
 * row the database does not accept.
 *
 * AN APPROVAL BELONGS TO ONE CUSTOMER AND ONE APPLICATION
 *
 * A customer-approved supplier carries the customer and the application that
 * approved it, and the corpus-level candidate table accepts only the two
 * standings the corpus owns. There is no column in which a corpus candidate
 * can be CUSTOMER_APPROVED, so one buyer's qualification work cannot be
 * promoted into inventory sold to the next.
 *
 * COVERAGE IS ASSESSED PER ARTIFACT, AND THE ROW IS THE SUM OF ITS EVIDENCE
 *
 * A coverage row carries two things about a facet: a level, which says how
 * much usable evidence bears on it, and an assessment — PRESENT, STALE,
 * CONFLICTING, MISSING or DISALLOWED — which says what the evidence is. Both
 * are functions of the evidence rows beneath, one per artifact, and the
 * database holds them to it: an evidence row's assessment is recomputed at
 * commit from the artifact's rights against the right the dossier's delivery
 * exercises, its validation, its horizon against the assessment instant, the
 * records it read against what the corpus has since taken back, and the
 * other artifacts on the same facet; the coverage row's counts, run counts
 * and artifact list must equal what its evidence rows say; the level is a
 * CHECK over the present count; the assessment is a CHECK over the four
 * counts. An agent writes the rows and cannot write a PRESENT the artifact
 * does not earn, a level the present count does not give, or a headline
 * that hides a disallowed artifact behind a present one.
 *
 * And a conclusion rests on present evidence: the artifact it names must be
 * assessed PRESENT, for that facet, in the dossier it is released under, at
 * an assessment no later than the build. What was disallowed for customer
 * delivery holds nothing up.
 *
 * THE ASSESSMENT IS A FACT AT ITS INSTANT, AND THE ROWS ARE WRITTEN ONCE
 *
 * A coverage row, its evidence rows, a release and its conclusions are
 * never updated or deleted. Every guard above checks a row as it is
 * written; a rewrite afterwards would be a row none of them looked at, so
 * the ledger refuses the rewrite instead. What that leaves is the append:
 * an artifact that arrives on a facet later is checked together with
 * every artifact already there, since a neighbour that disagrees changes
 * what an earlier row earned. And a retraction that claims to have been
 * issued before an assessment which did not know it is refused: the ledger
 * cannot accept that something was known at an instant its own row says
 * it was not. A refutation is dated the same way — the validation record
 * carries its instant, the assessment reads the record standing at its own
 * instant — and a refutation backdated behind an assessment that did not
 * know it is refused for the same reason. One recorded after the assessment
 * goes in, and the row stands as a fact at its instant; the re-assessment
 * reads it.
 *
 * RE-ASSESSMENT IS A NEW ROW, AND A RELEASE NAMES WHAT IT WAS BUILT OVER
 *
 * A corpus that moves after the quote is read again: a second coverage
 * row for the facet, at a later instant, with its own evidence rows, held
 * to the same guards. The rows are keyed on (facet, assessed_at) and each
 * must be later than the last, so an assessment is never backdated behind
 * one that already stands. A release names, for every facet of its
 * dossier, the assessment it was built over — the latest at or before its
 * build — and a conclusion rests on present evidence in the row its
 * release names, not in any row that ever existed. The estimate counts the
 * coverage as it stood when it was estimated, by the one method the
 * column may name; and a release whose named assessment carries a level
 * the quotation did not is refused: a material change in scope is an
 * amendment the customer agrees to, never a quiet substitution. A release
 * built after the corpus moved under its named row — a record a present
 * artifact rests on taken back, a present artifact's horizon passed, or a
 * present artifact refuted, between the assessment and the build — is
 * refused too: the row is a fact at its instant, the build is not at that
 * instant, and the schema's answer is the re-assessment it now holds a
 * place for.
 *
 * THE ESTIMATE IS A COUNT AND THE PRICE IS A POLICY
 *
 * A coverage row per facet says what the inventory held. An estimate is a
 * count of units over those rows, with its method named. A quotation carries
 * the estimate's units and the policy's unit rate, both tied to their rows by
 * composite key, and a CHECK requires the amount to be their product. An
 * agent can produce every row above the quotation and cannot produce the
 * rate, and the quotation cannot carry a number the two do not multiply to.
 *
 * A RELEASE IS AUTHORIZED TWICE, AND BOTH TIMES OF A DIGEST
 *
 * Once by the customer, who accepted a quotation: the release carries the
 * quotation's digest and the authorization the customer's approval produced,
 * tied by (authorization, digest) into the execution ledger. Once by a
 * reviewer, who approved this release: the release carries its own digest —
 * over its conclusions and snapshots — and the authorization that approval
 * produced, tied the same way. A release compiled against a quote the
 * customer did not accept has no scope authorization to name; a release
 * edited after review has a digest no authorization carries. Both are rows the
 * database refuses, and one authorization releases one version.
 *
 * A QUOTE AND A BUILD ARE TWO SNAPSHOTS
 *
 * Both are kept, and the build cannot precede the quote. A customer billed
 * against one and delivered the other can see the difference, which is the
 * only way an amendment is distinguishable from a substitution.
 *
 * A REFRESH IS A NEW RELEASE, AND A DELIVERY IS A DISPATCH
 *
 * Versions strictly increase and the predecessor stays. A delivery names the
 * execution attempt that carried it, so "delivered" is an outcome the action
 * layer recorded — CONFIRMED, REJECTED or OUTCOME_UNKNOWN — and not a column
 * somebody set. What the receipt rests on is a required sentence, and in the
 * demonstration that sentence says the receipt was simulated locally.
 *
 * AND AGAINST THE REAL CORPUS NOTHING CAN BE QUOTED
 *
 * A quotation names the pricing policy it was priced under. No policy is
 * approved for the real corpus, so the foreign key has nothing to point at
 * and no quotation can be written — which is the structural form of "an agent
 * may not invent a price". The demonstration seeds one, and says so.
 */
import {
  CANDIDATE_STANDINGS, COVERAGE_ASSESSMENTS, COVERAGE_LEVELS, COVERAGE_LEVEL_UNITS, DELIVERY_RIGHT, DOSSIER_FACETS, DOSSIER_STAGES,
  ESTIMATE_METHOD, REUSABLE_STANDINGS,
} from '@/domain/dossierService';
import { DERIVABLE_CLASSES } from '@/domain/discoveryLayer';
import { quoted } from './ddl';

export const DOSSIER_LEDGER_DDL = `
-- What was asked, and by whom.
CREATE TABLE dossier_spec (
  dossier_id text PRIMARY KEY,
  recipient_id text NOT NULL CHECK (length(btrim(recipient_id)) > 0),
  question text NOT NULL CHECK (length(btrim(question)) > 0),
  stage text NOT NULL CHECK (stage IN (${quoted(DOSSIER_STAGES)})),
  asked_at timestamptz NOT NULL,
  -- The right a delivery of this dossier exercises. Every artifact's
  -- assessment is against it, so it is not the writer's to choose: one
  -- value, the domain's, and widening it is a decision rather than a write.
  required_right text NOT NULL CHECK (required_right = '${DELIVERY_RIGHT}'),
  UNIQUE (dossier_id, recipient_id)
);

-- One facet of the question. Nine possible; a spec asks for the ones it
-- needs, and asks before anything counts them: a facet added after the
-- estimate would change what was estimated and what a release must name.
CREATE TABLE dossier_facet (
  dossier_facet_id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossier_spec (dossier_id),
  facet text NOT NULL CHECK (facet IN (${quoted(DOSSIER_FACETS)})),
  CONSTRAINT facet_once_per_dossier UNIQUE (dossier_id, facet)
);

-- What the inventory held for one facet, at an instant: how much of it may
-- be used (the level) and what it is (the assessment), both held to the
-- evidence rows beneath. One row per facet per instant; a later row is a
-- re-assessment, and the earlier one stands.
CREATE TABLE dossier_coverage (
  coverage_id text PRIMARY KEY,
  dossier_facet_id text NOT NULL REFERENCES dossier_facet (dossier_facet_id),
  -- The two vocabulary checks document; the two CASE constraints below
  -- refuse, and sort first, so these are never the constraint named.
  level text NOT NULL CHECK (level IN (${quoted(COVERAGE_LEVELS)})),
  assessment text NOT NULL CHECK (assessment IN (${quoted(COVERAGE_ASSESSMENTS)})),
  artifacts_available integer NOT NULL CHECK (artifacts_available >= 0),
  -- One count per assessment an artifact can carry. MISSING is not one: it
  -- is the assessment of a facet with no artifact, and has no count.
  artifacts_present integer NOT NULL CHECK (artifacts_present >= 0),
  artifacts_stale integer NOT NULL CHECK (artifacts_stale >= 0),
  artifacts_conflicting integer NOT NULL CHECK (artifacts_conflicting >= 0),
  artifacts_disallowed integer NOT NULL CHECK (artifacts_disallowed >= 0),
  runs_represented integer NOT NULL CHECK (runs_represented >= 0),
  -- Runs among the present artifacts. The level counts these, not the others.
  runs_usable integer NOT NULL CHECK (runs_usable >= 0),
  -- Which artifacts, so the count is a count of something a reader can open.
  artifact_ids text[] NOT NULL DEFAULT '{}',
  basis text NOT NULL CHECK (length(btrim(basis)) > 0),
  assessed_at timestamptz NOT NULL,

  CONSTRAINT coverage_assessed_once_per_instant UNIQUE (dossier_facet_id, assessed_at),
  CONSTRAINT coverage_names_what_it_counts CHECK (cardinality(artifact_ids) = artifacts_available),
  CONSTRAINT coverage_counts_add_up CHECK (artifacts_present + artifacts_stale + artifacts_conflicting + artifacts_disallowed = artifacts_available),
  CONSTRAINT coverage_runs_are_among_artifacts CHECK (
    runs_represented <= artifacts_available AND (runs_represented = 0) = (artifacts_available = 0)
    AND runs_usable <= artifacts_present AND runs_usable <= runs_represented AND (runs_usable = 0) = (artifacts_present = 0)
  ),
  -- The level is the domain's coverageLevel over the present artifacts:
  -- NONE when none is present, SUPPORTED at two or more from two or more
  -- runs, THIN between. A disallowed, stale or contradicted artifact is in
  -- the row and not in the level.
  CONSTRAINT coverage_level_counts_the_present CHECK (level = CASE
    WHEN artifacts_present = 0 THEN 'NONE'
    WHEN artifacts_present >= 2 AND runs_usable >= 2 THEN 'SUPPORTED'
    ELSE 'THIN' END),
  -- The assessment is the domain's rollupAssessment over the counts: MISSING
  -- when nothing bears on the facet, else worst-first over what is not
  -- present, and PRESENT only when everything is.
  CONSTRAINT coverage_assessment_is_the_rollup CHECK (assessment = CASE
    WHEN artifacts_available = 0 THEN 'MISSING'
    WHEN artifacts_conflicting > 0 THEN 'CONFLICTING'
    WHEN artifacts_stale > 0 THEN 'STALE'
    WHEN artifacts_disallowed > 0 THEN 'DISALLOWED'
    ELSE 'PRESENT' END)
);

-- One artifact bearing on one facet, with what it was assessed as and why.
-- The guards below hold the assessment to the artifact and the coverage row
-- to these rows.
CREATE TABLE dossier_coverage_evidence (
  evidence_id text PRIMARY KEY,
  coverage_id text NOT NULL REFERENCES dossier_coverage (coverage_id),
  artifact_id text NOT NULL,
  -- Tied to the artifact's run, so the coverage row's run counts are counts
  -- over rows a reader can open.
  run_id text NOT NULL,
  -- An evidence row is something, so it is never MISSING.
  assessment text NOT NULL CHECK (assessment IN (${quoted(COVERAGE_ASSESSMENTS)}) AND assessment <> 'MISSING'),
  because text NOT NULL CHECK (length(btrim(because)) > 0),

  CONSTRAINT evidence_artifact FOREIGN KEY (artifact_id, run_id) REFERENCES derived_artifact (artifact_id, run_id),
  CONSTRAINT evidence_once_per_coverage UNIQUE (coverage_id, artifact_id)
);

-- Units of work, counted over the coverage rows as they stood when the
-- estimate was made, by the one method the column may name. An agent may
-- count; it may not invent a method.
CREATE TABLE dossier_estimate (
  estimate_id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossier_spec (dossier_id),
  method text NOT NULL CHECK (method = '${ESTIMATE_METHOD}'),
  units integer NOT NULL CHECK (units > 0),
  per_facet jsonb NOT NULL,
  estimate_digest text NOT NULL CHECK (estimate_digest ~ '^sha256:[a-f0-9]{64}$'),
  estimated_at timestamptz NOT NULL,
  CONSTRAINT estimate_per_facet_is_array CHECK (jsonb_typeof(per_facet) = 'array'),
  UNIQUE (estimate_id, dossier_id, units, estimated_at)
);

-- The pricing policy a quotation is priced under, with the rate it sets.
CREATE TABLE pricing_policy (
  policy_id text PRIMARY KEY,
  approved_by text NOT NULL CHECK (length(btrim(approved_by)) > 0),
  approved_at timestamptz NOT NULL,
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor > 0),
  currency text NOT NULL CHECK (length(currency) = 3),
  unit text NOT NULL CHECK (length(btrim(unit)) > 0),
  UNIQUE (policy_id, unit_price_minor, currency)
);

-- What the work was quoted at: the estimate's units at the policy's rate.
CREATE TABLE dossier_quotation (
  quotation_id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossier_spec (dossier_id),
  -- No approved policy, no quotation. An agent may tailor the package and may
  -- not invent the number.
  pricing_policy_id text NOT NULL,
  unit_price_minor bigint NOT NULL,
  currency text NOT NULL,
  estimate_id text NOT NULL,
  units integer NOT NULL,
  -- Denormalised from the estimate and tied, so the quote is dated after
  -- the count it prices.
  estimated_at timestamptz NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  -- The corpus as it stood when the quote was given.
  quoted_snapshot text NOT NULL CHECK (quoted_snapshot ~ '^sha256:[a-f0-9]{64}$'),
  quoted_at timestamptz NOT NULL,
  -- The digest of the quotation as put to the customer. Their acceptance is of this.
  quotation_digest text NOT NULL CHECK (quotation_digest ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT quotation_policy FOREIGN KEY (pricing_policy_id, unit_price_minor, currency)
    REFERENCES pricing_policy (policy_id, unit_price_minor, currency),
  -- This dossier's estimate, not another's.
  CONSTRAINT quotation_estimate FOREIGN KEY (estimate_id, dossier_id, units, estimated_at)
    REFERENCES dossier_estimate (estimate_id, dossier_id, units, estimated_at),
  CONSTRAINT quotation_after_estimate CHECK (quoted_at >= estimated_at),
  -- The one arithmetic that is a single-row fact.
  CONSTRAINT quotation_is_units_at_the_rate CHECK (amount_minor = units * unit_price_minor),
  UNIQUE (quotation_id, dossier_id, quoted_snapshot, quoted_at),
  UNIQUE (quotation_id, quotation_digest)
);

-- What was compiled, and released, under two authorizations.
CREATE TABLE dossier_release (
  dossier_release_id text PRIMARY KEY,
  dossier_id text NOT NULL,
  -- Carried here rather than looked up, so the delivery below can be tied to it.
  recipient_id text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  quotation_id text NOT NULL,
  -- Denormalised from the quotation and tied, so the ordering check below is
  -- about the quote that actually priced this work.
  quoted_snapshot text NOT NULL,
  quoted_at timestamptz NOT NULL,
  quotation_digest text NOT NULL,
  -- The customer's acceptance of that quotation: an authorization in the
  -- execution ledger, of that digest.
  scope_authorization_id text NOT NULL,
  -- The corpus as it stood when the dossier was BUILT, which may differ.
  built_snapshot text NOT NULL CHECK (built_snapshot ~ '^sha256:[a-f0-9]{64}$'),
  built_at timestamptz NOT NULL,
  -- The digest of the compiled release, and the reviewer's approval of it.
  release_digest text NOT NULL CHECK (release_digest ~ '^sha256:[a-f0-9]{64}$'),
  authorization_id text NOT NULL,
  released_at timestamptz NOT NULL,
  monitored boolean NOT NULL DEFAULT false,

  CONSTRAINT release_spec FOREIGN KEY (dossier_id, recipient_id) REFERENCES dossier_spec (dossier_id, recipient_id),
  -- This dossier's quotation, not another's.
  CONSTRAINT release_quotation FOREIGN KEY (quotation_id, dossier_id, quoted_snapshot, quoted_at)
    REFERENCES dossier_quotation (quotation_id, dossier_id, quoted_snapshot, quoted_at),
  CONSTRAINT release_quotation_digest FOREIGN KEY (quotation_id, quotation_digest)
    REFERENCES dossier_quotation (quotation_id, quotation_digest),
  -- The customer accepted THIS quotation. No acceptance, no release.
  CONSTRAINT release_scope_accepted FOREIGN KEY (scope_authorization_id, quotation_digest)
    REFERENCES execution_authorization (authorization_id, action_digest),
  -- A reviewer approved THIS release. A release edited after review has a
  -- digest no authorization carries.
  CONSTRAINT release_reviewed FOREIGN KEY (authorization_id, release_digest)
    REFERENCES execution_authorization (authorization_id, action_digest),
  CONSTRAINT release_two_authorizations CHECK (authorization_id <> scope_authorization_id),
  -- The build reads the corpus as it stands when it runs, so it cannot have
  -- read it before the quote was given.
  CONSTRAINT release_built_after_quoted CHECK (built_at >= quoted_at),
  CONSTRAINT release_released_after_built CHECK (released_at >= built_at),

  CONSTRAINT release_version_once UNIQUE (dossier_id, version),
  -- One approval releases one version.
  CONSTRAINT release_authorization_once UNIQUE (authorization_id),
  UNIQUE (dossier_release_id, recipient_id),
  UNIQUE (dossier_release_id, version)
);

-- What a release was built over: one assessment per facet of its dossier,
-- the latest at or before the build. The guards hold a release to naming
-- every facet, its own dossier's rows, nothing assessed after the build,
-- nothing superseded, and nothing at a level the quotation did not carry.
CREATE TABLE dossier_release_coverage (
  dossier_release_id text NOT NULL REFERENCES dossier_release (dossier_release_id),
  coverage_id text NOT NULL REFERENCES dossier_coverage (coverage_id),
  PRIMARY KEY (dossier_release_id, coverage_id)
);

-- A refresh or a correction, which is a new release rather than an edit of the old one.
CREATE TABLE release_succession (
  succession_id text PRIMARY KEY,
  successor_release_id text NOT NULL,
  successor_version integer NOT NULL,
  predecessor_release_id text NOT NULL,
  predecessor_version integer NOT NULL,
  -- Why. A refresh says the corpus moved; a correction names what was wrong.
  because text NOT NULL CHECK (length(btrim(because)) > 0),

  CONSTRAINT succession_successor FOREIGN KEY (successor_release_id, successor_version)
    REFERENCES dossier_release (dossier_release_id, version),
  CONSTRAINT succession_predecessor FOREIGN KEY (predecessor_release_id, predecessor_version)
    REFERENCES dossier_release (dossier_release_id, version),
  -- Forward only. This also refuses a release succeeding itself, since a
  -- version cannot exceed itself.
  CONSTRAINT succession_moves_forward CHECK (successor_version > predecessor_version),
  CONSTRAINT succession_predecessor_once UNIQUE (predecessor_release_id)
);

-- What the dossier concluded, per facet.
CREATE TABLE dossier_conclusion (
  conclusion_id text PRIMARY KEY,
  dossier_release_id text NOT NULL REFERENCES dossier_release (dossier_release_id),
  facet text NOT NULL CHECK (facet IN (${quoted(DOSSIER_FACETS)})),
  statement text NOT NULL CHECK (length(btrim(statement)) > 0),
  -- What the evidence did not cover. Never blank: an omitted gap reads as
  -- completeness, and a customer cannot ask about a hole they cannot see.
  not_covered text NOT NULL CHECK (length(btrim(not_covered)) > 0),
  -- Where it came from, and the class it actually carries.
  artifact_id text NOT NULL,
  artifact_class text NOT NULL,
  -- And the class the dossier presents it as.
  presented_as text NOT NULL,

  CONSTRAINT conclusion_artifact FOREIGN KEY (artifact_id, artifact_class)
    REFERENCES derived_artifact (artifact_id, claim_class),
  -- A dossier is a serving surface and being well-written does not exempt it.
  CONSTRAINT conclusion_presented_at_its_class CHECK (presented_as = artifact_class),
  CONSTRAINT conclusion_once_per_facet UNIQUE (dossier_release_id, facet)
);

-- A supplier the corpus surfaced. The corpus owns two standings and not the third.
CREATE TABLE corpus_candidate (
  candidate_id text PRIMARY KEY,
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  -- CUSTOMER_APPROVED is absent. There is no column here in which one buyer's
  -- qualification work becomes a property of the supplier.
  standing text NOT NULL CHECK (standing IN (${quoted(REUSABLE_STANDINGS)})),
  found_at timestamptz NOT NULL
);

-- And a supplier one customer approved, for one application.
CREATE TABLE customer_approval (
  approval_id text PRIMARY KEY,
  entity_id text NOT NULL,
  recipient_id text NOT NULL CHECK (length(btrim(recipient_id)) > 0),
  -- The specification it was approved against. A different application is a
  -- different question, even for the same buyer.
  application text NOT NULL CHECK (length(btrim(application)) > 0),
  standing text NOT NULL CHECK (standing IN (${quoted(CANDIDATE_STANDINGS)})),
  approved_at timestamptz NOT NULL,

  -- Only the customer-held standing lives here, and only with both of the
  -- things that scope it.
  CONSTRAINT approval_is_customer_held CHECK (standing = 'CUSTOMER_APPROVED'),
  CONSTRAINT approval_once UNIQUE (entity_id, recipient_id, application)
);

-- Who it was handed to, and the dispatch that handed it. The recipient is a
-- free column so the wrong one is a row somebody can write and the database
-- can refuse.
CREATE TABLE dossier_delivery (
  delivery_id text PRIMARY KEY,
  dossier_release_id text NOT NULL,
  recipient_id text NOT NULL CHECK (length(btrim(recipient_id)) > 0),
  -- The execution attempt that carried it. Delivered is what the action
  -- layer recorded, not a column somebody set.
  attempt_id text NOT NULL UNIQUE REFERENCES execution_attempt (attempt_id),
  -- What the receipt rests on. In the demonstration: a local simulation.
  receipt_basis text NOT NULL CHECK (length(btrim(receipt_basis)) > 0),
  delivered_at timestamptz NOT NULL,

  CONSTRAINT delivery_goes_to_the_dossiers_recipient FOREIGN KEY (dossier_release_id, recipient_id)
    REFERENCES dossier_release (dossier_release_id, recipient_id)
);

CREATE INDEX conclusion_by_release ON dossier_conclusion (dossier_release_id);
CREATE INDEX release_by_dossier ON dossier_release (dossier_id, version);
CREATE INDEX approval_by_recipient ON customer_approval (recipient_id);
CREATE INDEX coverage_by_facet ON dossier_coverage (dossier_facet_id, assessed_at);
CREATE INDEX release_coverage_by_coverage ON dossier_release_coverage (coverage_id);
CREATE INDEX evidence_by_coverage ON dossier_coverage_evidence (coverage_id);
`;

/**
 * The guards. The deferred ones read the rows as they will stand at commit,
 * so a coverage row and its evidence rows go in together or not at all; the
 * immediate ones refuse a rewrite of a row that was already checked.
 *
 * Reads `retracted_record` from `src/db/retractedRecord.ts`: what the corpus
 * took back, and when, and whether it said something else (CORRECTION) or
 * nothing (WITHDRAWAL).
 */
export const DOSSIER_LEDGER_GUARDS = `
-- The assessment an artifact earns on one coverage row, recomputed from what
-- the ledger holds, in the domain's order: the delivery right first, then a
-- corrected input, a disagreeing neighbour on the facet or a refuted claim,
-- then the horizon and a withdrawn input, then PRESENT. Inputs are followed
-- through derived artifacts down to the source records, so a record taken
-- back reaches everything computed over it at any depth. A retraction and a
-- refutation are read as of the assessment instant: the retraction issued
-- by then, the validation record standing then. And an artifact computed
-- after the assessment instant was not there to be assessed.
CREATE FUNCTION dossier_expected_assessment(target_coverage text, target_artifact text) RETURNS text AS $$
DECLARE
  cov dossier_coverage%ROWTYPE;
  art derived_artifact%ROWTYPE;
  required text;
  corrected text;
  withdrawn text;
  disagreeing text;
  standing_validation text;
BEGIN
  SELECT * INTO cov FROM dossier_coverage WHERE coverage_id = target_coverage;
  SELECT * INTO art FROM derived_artifact WHERE artifact_id = target_artifact;
  SELECT s.required_right INTO required
    FROM dossier_facet f JOIN dossier_spec s ON s.dossier_id = f.dossier_id
    WHERE f.dossier_facet_id = cov.dossier_facet_id;
  IF art.computed_at > cov.assessed_at THEN
    RAISE EXCEPTION 'evidence_computed_after_it_was_assessed:%:computed % assessed %', target_artifact, art.computed_at, cov.assessed_at;
  END IF;
  WITH RECURSIVE reads AS (
    SELECT i.source_record_id, i.input_artifact_id FROM artifact_input i WHERE i.artifact_id = target_artifact
    UNION
    SELECT i.source_record_id, i.input_artifact_id FROM artifact_input i JOIN reads ON i.artifact_id = reads.input_artifact_id
  )
  SELECT string_agg(x, ', ' ORDER BY x) FILTER (WHERE kind = 'CORRECTION'), string_agg(x, ', ' ORDER BY x) FILTER (WHERE kind = 'WITHDRAWAL')
    INTO corrected, withdrawn
    FROM (SELECT DISTINCT reads.source_record_id AS x, r.kind
          FROM reads JOIN retracted_record r ON r.record_id = reads.source_record_id
          WHERE r.issued_at <= cov.assessed_at) AS taken_back;
  SELECT string_agg(o.artifact_id, ', ' ORDER BY o.artifact_id) INTO disagreeing
    FROM dossier_coverage_evidence e JOIN derived_artifact o ON o.artifact_id = e.artifact_id
    WHERE e.coverage_id = target_coverage AND e.artifact_id <> target_artifact
      AND o.subject = art.subject AND o.claim <> art.claim;
  -- The validation standing at the assessment instant: the latest record at
  -- or before it. A refutation dated after the instant is not yet known.
  SELECT v.outcome INTO standing_validation
    FROM artifact_validation v
    WHERE v.artifact_id = target_artifact AND v.validated_at <= cov.assessed_at
    ORDER BY v.validated_at DESC LIMIT 1;
  RETURN CASE
    WHEN NOT (required = ANY (art.rights)) THEN 'DISALLOWED'
    WHEN corrected IS NOT NULL THEN 'CONFLICTING'
    WHEN disagreeing IS NOT NULL THEN 'CONFLICTING'
    WHEN standing_validation = 'FALSIFIED' THEN 'CONFLICTING'
    WHEN art.horizon_ends_at IS NOT NULL AND art.horizon_ends_at < cov.assessed_at THEN 'STALE'
    WHEN withdrawn IS NOT NULL THEN 'STALE'
    ELSE 'PRESENT' END;
END;
$$ LANGUAGE plpgsql;

-- The evidence row written is held to its artifact. A neighbour arriving in
-- a later transaction would change what an earlier row earned, and cannot
-- arrive: the coverage row names its artifacts, is written once, and must
-- match its evidence rows. Within one transaction every row is checked at
-- commit, against every other.
CREATE FUNCTION refuse_evidence_not_assessed_as_the_artifact_is() RETURNS trigger AS $$
DECLARE
  expected text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dossier_coverage WHERE coverage_id = NEW.coverage_id)
     OR NOT EXISTS (SELECT 1 FROM derived_artifact WHERE artifact_id = NEW.artifact_id) THEN
    RETURN NEW; -- the foreign keys refuse these
  END IF;
  expected := dossier_expected_assessment(NEW.coverage_id, NEW.artifact_id);
  IF NEW.assessment <> expected THEN
    RAISE EXCEPTION 'evidence_assessment_is_not_the_artifacts:%:% recorded, % from the artifact', NEW.artifact_id, NEW.assessment, expected;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER evidence_assessment_is_the_artifacts
  AFTER INSERT ON dossier_coverage_evidence
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_evidence_not_assessed_as_the_artifact_is();

-- A coverage row is the sum of its evidence rows: the same artifacts, the
-- same counts per assessment, the same runs. Fires from both sides, so a
-- coverage row cannot outrun its evidence and an evidence row cannot arrive
-- after the count was taken.
CREATE FUNCTION refuse_coverage_unlike_its_evidence() RETURNS trigger AS $$
DECLARE
  cov dossier_coverage%ROWTYPE;
  named text[];
  listed text[];
  n_present integer; n_stale integer; n_conflicting integer; n_disallowed integer;
  n_runs integer; n_runs_usable integer;
BEGIN
  SELECT * INTO cov FROM dossier_coverage WHERE coverage_id = NEW.coverage_id;
  IF cov.coverage_id IS NULL THEN
    RETURN NULL; -- the foreign key refuses evidence of no coverage
  END IF;
  SELECT coalesce(array_agg(artifact_id ORDER BY artifact_id), '{}'),
         count(*) FILTER (WHERE assessment = 'PRESENT'), count(*) FILTER (WHERE assessment = 'STALE'),
         count(*) FILTER (WHERE assessment = 'CONFLICTING'), count(*) FILTER (WHERE assessment = 'DISALLOWED'),
         count(DISTINCT run_id), count(DISTINCT run_id) FILTER (WHERE assessment = 'PRESENT')
    INTO listed, n_present, n_stale, n_conflicting, n_disallowed, n_runs, n_runs_usable
    FROM dossier_coverage_evidence WHERE coverage_id = cov.coverage_id;
  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO named FROM unnest(cov.artifact_ids) AS x;
  IF named <> listed THEN
    RAISE EXCEPTION 'coverage_does_not_match_its_evidence:%:names % but its evidence rows are %', cov.coverage_id, named, listed;
  END IF;
  IF cov.artifacts_present <> n_present OR cov.artifacts_stale <> n_stale
     OR cov.artifacts_conflicting <> n_conflicting OR cov.artifacts_disallowed <> n_disallowed THEN
    RAISE EXCEPTION 'coverage_does_not_match_its_evidence:%:counts %/%/%/% but its evidence rows are %/%/%/%',
      cov.coverage_id, cov.artifacts_present, cov.artifacts_stale, cov.artifacts_conflicting, cov.artifacts_disallowed, n_present, n_stale, n_conflicting, n_disallowed;
  END IF;
  IF cov.runs_represented <> n_runs OR cov.runs_usable <> n_runs_usable THEN
    RAISE EXCEPTION 'coverage_does_not_match_its_evidence:%:runs %/% but its evidence rows are %/%', cov.coverage_id, cov.runs_represented, cov.runs_usable, n_runs, n_runs_usable;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER coverage_matches_evidence
  AFTER INSERT ON dossier_coverage
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_coverage_unlike_its_evidence();

CREATE CONSTRAINT TRIGGER evidence_matches_coverage
  AFTER INSERT ON dossier_coverage_evidence
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_coverage_unlike_its_evidence();

-- A conclusion rests on evidence assessed PRESENT for its facet, in the
-- assessment its release names for that facet — not in any row that ever
-- existed for it.
CREATE FUNCTION refuse_conclusion_without_present_evidence() RETURNS trigger AS $$
DECLARE
  rests_on text;
BEGIN
  SELECT e.evidence_id INTO rests_on
    FROM dossier_release_coverage rc
    JOIN dossier_coverage c ON c.coverage_id = rc.coverage_id
    JOIN dossier_facet f ON f.dossier_facet_id = c.dossier_facet_id AND f.facet = NEW.facet
    JOIN dossier_coverage_evidence e ON e.coverage_id = c.coverage_id AND e.artifact_id = NEW.artifact_id
    WHERE rc.dossier_release_id = NEW.dossier_release_id AND e.assessment = 'PRESENT'
    LIMIT 1;
  IF rests_on IS NULL THEN
    RAISE EXCEPTION 'conclusion_rests_on_no_present_evidence:%:% in %', NEW.artifact_id, NEW.facet, NEW.dossier_release_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER conclusion_rests_on_present_evidence
  AFTER INSERT ON dossier_conclusion
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_conclusion_without_present_evidence();

-- A re-assessment is later than the last, and later than anything that has
-- already read the facet as of an instant: an estimate counted it, a
-- release was built over it. The same instant as the last is refused by
-- the key; an earlier one would be an assessment backdated behind a row
-- that stands, or behind a count or a build whose "latest at or before"
-- it would quietly change.
CREATE FUNCTION refuse_assessment_behind_the_last() RETURNS trigger AS $$
DECLARE
  last_at timestamptz;
  read_at timestamptz;
  facet_dossier text;
BEGIN
  SELECT max(assessed_at) INTO last_at FROM dossier_coverage WHERE dossier_facet_id = NEW.dossier_facet_id;
  IF last_at IS NOT NULL AND NEW.assessed_at < last_at THEN
    RAISE EXCEPTION 'assessment_is_later_than_the_last:%:assessed % behind one at %', NEW.dossier_facet_id, NEW.assessed_at, last_at;
  END IF;
  SELECT dossier_id INTO facet_dossier FROM dossier_facet WHERE dossier_facet_id = NEW.dossier_facet_id;
  SELECT greatest(
    (SELECT max(estimated_at) FROM dossier_estimate WHERE dossier_id = facet_dossier),
    (SELECT max(built_at) FROM dossier_release WHERE dossier_id = facet_dossier)
  ) INTO read_at;
  IF read_at IS NOT NULL AND NEW.assessed_at <= read_at THEN
    RAISE EXCEPTION 'assessment_is_later_than_the_last:%:assessed % behind a count or a build at %', NEW.dossier_facet_id, NEW.assessed_at, read_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_is_later_than_the_last BEFORE INSERT ON dossier_coverage
  FOR EACH ROW EXECUTE FUNCTION refuse_assessment_behind_the_last();

-- An estimate counts the coverage as it stood when it was made: for every
-- facet of the dossier, the latest assessment at or before estimated_at,
-- at that assessment's level, by the method's units — and no facet the
-- dossier did not ask for.
CREATE FUNCTION refuse_estimate_unlike_the_coverage() RETURNS trigger AS $$
DECLARE
  facet_row record;
  quoted record;
  n_quoted integer;
  n_facets integer;
  counted integer := 0;
BEGIN
  SELECT count(*) INTO n_quoted FROM jsonb_array_elements(NEW.per_facet);
  SELECT count(*) INTO n_facets FROM dossier_facet WHERE dossier_id = NEW.dossier_id;
  IF n_quoted <> n_facets THEN
    RAISE EXCEPTION 'estimate_counts_the_dossiers_facets:%:% counted, % asked', NEW.estimate_id, n_quoted, n_facets;
  END IF;
  FOR facet_row IN
    SELECT f.facet,
           (SELECT c.level FROM dossier_coverage c WHERE c.dossier_facet_id = f.dossier_facet_id AND c.assessed_at <= NEW.estimated_at
             ORDER BY c.assessed_at DESC LIMIT 1) AS level
      FROM dossier_facet f WHERE f.dossier_id = NEW.dossier_id ORDER BY f.facet
  LOOP
    IF facet_row.level IS NULL THEN
      RAISE EXCEPTION 'estimate_over_an_unassessed_facet:%:% had no assessment by %', NEW.estimate_id, facet_row.facet, NEW.estimated_at;
    END IF;
    SELECT elem->>'level' AS level, (elem->>'units')::integer AS units INTO quoted
      FROM jsonb_array_elements(NEW.per_facet) AS elem WHERE elem->>'facet' = facet_row.facet;
    IF quoted.level IS NULL THEN
      RAISE EXCEPTION 'estimate_counts_the_dossiers_facets:%:% not counted', NEW.estimate_id, facet_row.facet;
    END IF;
    IF quoted.level <> facet_row.level THEN
      RAISE EXCEPTION 'estimate_misstates_a_facets_level:%:% counted as %, assessed %', NEW.estimate_id, facet_row.facet, quoted.level, facet_row.level;
    END IF;
    -- Parenthesised: the IF reads to the first bare THEN, and the CASE has three.
    IF quoted.units IS NULL OR quoted.units <> (CASE facet_row.level ${Object.entries(COVERAGE_LEVEL_UNITS).map(([level, units]) => `WHEN '${level}' THEN ${units}`).join(' ')} END) THEN
      RAISE EXCEPTION 'estimate_units_are_not_the_methods:%:% units for % at %', NEW.estimate_id, quoted.units, facet_row.facet, facet_row.level;
    END IF;
    counted := counted + quoted.units;
  END LOOP;
  IF NEW.units <> counted THEN
    RAISE EXCEPTION 'estimate_units_are_not_the_methods:%:% written, % counted', NEW.estimate_id, NEW.units, counted;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER estimate_counts_the_coverage_as_it_stood
  AFTER INSERT ON dossier_estimate
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_estimate_unlike_the_coverage();

-- A release names what it was built over: for every facet of its dossier,
-- exactly one assessment, of that dossier, at or before the build, and the
-- latest such — a re-assessment binds every later release. And at the level
-- the quotation carried: a level that moved since the quote is a change of
-- scope, and a change of scope is an amendment, never a substitution.
CREATE FUNCTION refuse_release_unlike_what_it_names() RETURNS trigger AS $$
DECLARE
  rel dossier_release%ROWTYPE;
  per_facet jsonb;
  facet_row record;
  named record;
  quoted_level text;
  later timestamptz;
  moved text;
BEGIN
  SELECT * INTO rel FROM dossier_release WHERE dossier_release_id = NEW.dossier_release_id;
  IF rel.dossier_release_id IS NULL THEN
    RETURN NULL; -- the foreign key refuses naming for no release
  END IF;
  SELECT e.per_facet INTO per_facet
    FROM dossier_quotation q JOIN dossier_estimate e ON e.estimate_id = q.estimate_id
    WHERE q.quotation_id = rel.quotation_id;
  FOR named IN
    SELECT c.coverage_id, c.assessed_at, c.level, f.facet, f.dossier_id
      FROM dossier_release_coverage rc
      JOIN dossier_coverage c ON c.coverage_id = rc.coverage_id
      JOIN dossier_facet f ON f.dossier_facet_id = c.dossier_facet_id
      WHERE rc.dossier_release_id = rel.dossier_release_id ORDER BY f.facet
  LOOP
    IF named.dossier_id <> rel.dossier_id THEN
      RAISE EXCEPTION 'release_names_another_dossiers_assessment:%:% belongs to %', rel.dossier_release_id, named.coverage_id, named.dossier_id;
    END IF;
    IF named.assessed_at > rel.built_at THEN
      RAISE EXCEPTION 'release_names_an_assessment_after_its_build:%:% assessed %, built %', rel.dossier_release_id, named.coverage_id, named.assessed_at, rel.built_at;
    END IF;
    SELECT max(c2.assessed_at) INTO later FROM dossier_coverage c2
      JOIN dossier_facet f2 ON f2.dossier_facet_id = c2.dossier_facet_id
      WHERE f2.dossier_id = rel.dossier_id AND f2.facet = named.facet AND c2.assessed_at > named.assessed_at AND c2.assessed_at <= rel.built_at;
    IF later IS NOT NULL THEN
      RAISE EXCEPTION 'release_names_a_superseded_assessment:%:% assessed %, but % was re-assessed at %', rel.dossier_release_id, named.coverage_id, named.assessed_at, named.facet, later;
    END IF;
    -- The corpus moved under the row between its assessment and this build:
    -- a record a present artifact rests on was taken back, a present
    -- artifact's horizon passed, or a present artifact was refuted. The row
    -- is a fact at its instant and the build is not at that instant; assess
    -- again.
    SELECT r.record_id || ' taken back at ' || r.issued_at INTO moved
      FROM dossier_coverage_evidence e
      JOIN (WITH RECURSIVE reads AS (
              SELECT i.artifact_id AS reader, i.source_record_id, i.input_artifact_id FROM artifact_input i
              UNION
              SELECT reads.reader, i.source_record_id, i.input_artifact_id FROM artifact_input i JOIN reads ON i.artifact_id = reads.input_artifact_id
            ) SELECT reader, source_record_id FROM reads WHERE source_record_id IS NOT NULL) AS rests ON rests.reader = e.artifact_id
      JOIN retracted_record r ON r.record_id = rests.source_record_id
      WHERE e.coverage_id = named.coverage_id AND e.assessment = 'PRESENT'
        AND r.issued_at > named.assessed_at AND r.issued_at <= rel.built_at
      ORDER BY r.issued_at, r.record_id LIMIT 1;
    IF moved IS NULL THEN
      SELECT a.artifact_id || '''s horizon ended at ' || a.horizon_ends_at INTO moved
        FROM dossier_coverage_evidence e JOIN derived_artifact a ON a.artifact_id = e.artifact_id
        WHERE e.coverage_id = named.coverage_id AND e.assessment = 'PRESENT'
          AND a.horizon_ends_at IS NOT NULL AND a.horizon_ends_at > named.assessed_at AND a.horizon_ends_at <= rel.built_at
        ORDER BY a.horizon_ends_at, a.artifact_id LIMIT 1;
    END IF;
    IF moved IS NULL THEN
      SELECT v.artifact_id || ' refuted at ' || v.validated_at INTO moved
        FROM dossier_coverage_evidence e JOIN artifact_validation v ON v.artifact_id = e.artifact_id
        WHERE e.coverage_id = named.coverage_id AND e.assessment = 'PRESENT'
          AND v.outcome = 'FALSIFIED' AND v.validated_at > named.assessed_at AND v.validated_at <= rel.built_at
        ORDER BY v.validated_at, v.artifact_id LIMIT 1;
    END IF;
    IF moved IS NOT NULL THEN
      RAISE EXCEPTION 'release_names_an_assessment_the_corpus_moved_under:%:% assessed %, then %; assess again', rel.dossier_release_id, named.coverage_id, named.assessed_at, moved;
    END IF;
    SELECT elem->>'level' INTO quoted_level FROM jsonb_array_elements(per_facet) AS elem WHERE elem->>'facet' = named.facet;
    IF quoted_level IS DISTINCT FROM named.level THEN
      RAISE EXCEPTION 'release_scope_changed_since_the_quote:%:% quoted %, assessed % — an amendment the customer agrees to, never a substitution', rel.dossier_release_id, named.facet, quoted_level, named.level;
    END IF;
  END LOOP;
  -- Two rows for one facet cannot both pass the above: the earlier is
  -- superseded by the later, or the later is after the build. What remains
  -- to check is that no facet was left unnamed.
  FOR facet_row IN
    SELECT f.facet
      FROM dossier_facet f
      WHERE f.dossier_id = rel.dossier_id AND NOT EXISTS (
        SELECT 1 FROM dossier_release_coverage rc JOIN dossier_coverage c ON c.coverage_id = rc.coverage_id
        WHERE rc.dossier_release_id = rel.dossier_release_id AND c.dossier_facet_id = f.dossier_facet_id)
      ORDER BY f.facet
  LOOP
    RAISE EXCEPTION 'release_names_no_assessment_for_a_facet:%:%', rel.dossier_release_id, facet_row.facet;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER release_names_its_assessments
  AFTER INSERT ON dossier_release
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_release_unlike_what_it_names();

CREATE CONSTRAINT TRIGGER named_assessment_is_the_releases
  AFTER INSERT ON dossier_release_coverage
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_release_unlike_what_it_names();

-- Written once. Every guard above checked the row as it went in; a rewrite
-- would be a row none of them looked at.
CREATE FUNCTION refuse_rewriting_a_ledger_row() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '%_is_written_once:% of %', TG_ARGV[0], TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coverage_is_written_once BEFORE UPDATE OR DELETE ON dossier_coverage
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_ledger_row('coverage');
CREATE TRIGGER evidence_is_written_once BEFORE UPDATE OR DELETE ON dossier_coverage_evidence
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_ledger_row('evidence');
CREATE TRIGGER conclusion_is_written_once BEFORE UPDATE OR DELETE ON dossier_conclusion
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_ledger_row('conclusion');
CREATE TRIGGER release_is_written_once BEFORE UPDATE OR DELETE ON dossier_release
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_ledger_row('release');
CREATE TRIGGER release_coverage_is_written_once BEFORE UPDATE OR DELETE ON dossier_release_coverage
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_ledger_row('release_coverage');
CREATE TRIGGER estimate_is_written_once BEFORE UPDATE OR DELETE ON dossier_estimate
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_ledger_row('estimate');

-- A spec moves through its stages; its terms do not move. (The right the
-- assessment was made against is one of them, and its CHECK already holds
-- it to one value, so it is not tested again here.)
CREATE FUNCTION refuse_rewriting_spec_terms() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'spec_terms_are_written_once:DELETE of %', OLD.dossier_id;
  END IF;
  IF NEW.dossier_id <> OLD.dossier_id OR NEW.recipient_id <> OLD.recipient_id OR NEW.question <> OLD.question
     OR NEW.asked_at <> OLD.asked_at THEN
    RAISE EXCEPTION 'spec_terms_are_written_once:UPDATE of % beyond its stage', OLD.dossier_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spec_terms_are_written_once BEFORE UPDATE OR DELETE ON dossier_spec
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_spec_terms();
CREATE TRIGGER facet_is_written_once BEFORE UPDATE OR DELETE ON dossier_facet
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_ledger_row('facet');

-- A facet is asked before anything counts the facets: after an estimate
-- or a release, adding one would change what was estimated and what a
-- release must name.
CREATE FUNCTION refuse_facet_after_the_count() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM dossier_estimate WHERE dossier_id = NEW.dossier_id)
     OR EXISTS (SELECT 1 FROM dossier_release WHERE dossier_id = NEW.dossier_id) THEN
    RAISE EXCEPTION 'facet_asked_after_the_estimate:%:%', NEW.dossier_id, NEW.facet;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER facet_asked_before_the_estimate BEFORE INSERT ON dossier_facet
  FOR EACH ROW EXECUTE FUNCTION refuse_facet_after_the_count();

-- A retraction recorded as issued before an assessment that did not know it
-- is refused where it would change what a standing row earned. The ledger
-- cannot accept that something was known at an instant its own row says it
-- was not; a retraction issued after the assessment is simply not yet known
-- to it, and goes in.
CREATE FUNCTION refuse_retraction_contradicting_an_assessment() RETURNS trigger AS $$
DECLARE
  standing record;
  expected text;
BEGIN
  FOR standing IN
    WITH RECURSIVE readers AS (
      SELECT i.artifact_id FROM artifact_input i WHERE i.source_record_id = NEW.record_id
      UNION
      SELECT i.artifact_id FROM artifact_input i JOIN readers ON i.input_artifact_id = readers.artifact_id
    )
    SELECT e.coverage_id, e.artifact_id, e.assessment
      FROM dossier_coverage_evidence e JOIN readers ON readers.artifact_id = e.artifact_id
      ORDER BY e.coverage_id, e.artifact_id
  LOOP
    expected := dossier_expected_assessment(standing.coverage_id, standing.artifact_id);
    IF standing.assessment <> expected THEN
      RAISE EXCEPTION 'retraction_contradicts_a_standing_assessment:%:% in % is % and would be % had % been known', NEW.retraction_id, standing.artifact_id, standing.coverage_id, standing.assessment, expected, NEW.record_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER retraction_leaves_assessments_standing
  AFTER INSERT ON retracted_record
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_retraction_contradicting_an_assessment();

-- A validation record dated at or before an assessment that did not know it
-- is refused the same way, where it would change what a standing row
-- earned: the row read the record standing at its instant, and a record
-- now claiming to have stood then says the row knew something it did not.
-- A record dated after the assessment is not yet known to it, and goes in;
-- the row stands, and the re-assessment reads it.
CREATE FUNCTION refuse_validation_contradicting_an_assessment() RETURNS trigger AS $$
DECLARE
  standing record;
  expected text;
BEGIN
  FOR standing IN
    SELECT e.coverage_id, e.artifact_id, e.assessment
      FROM dossier_coverage_evidence e WHERE e.artifact_id = NEW.artifact_id
      ORDER BY e.coverage_id
  LOOP
    expected := dossier_expected_assessment(standing.coverage_id, standing.artifact_id);
    IF standing.assessment <> expected THEN
      RAISE EXCEPTION 'validation_contradicts_a_standing_assessment:%:% in % is % and would be % had % been known', NEW.validation_id, standing.artifact_id, standing.coverage_id, standing.assessment, expected, NEW.validation_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER validation_leaves_assessments_standing
  AFTER INSERT ON artifact_validation
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_validation_contradicting_an_assessment();
`;

/** The classes a conclusion may carry, for the drift check against the domain. */
export const CONCLUSION_CLASSES = DERIVABLE_CLASSES;
