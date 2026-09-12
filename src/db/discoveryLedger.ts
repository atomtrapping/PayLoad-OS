/**
 * The discovery layer, in the database.
 *
 * `src/domain/discoveryLayer.ts` states the distinctions. This is where a
 * writer that never read them still cannot break them. Each constraint below
 * closes a failure that is quiet rather than loud — nothing crashes when a
 * prediction is served as an observation, which is exactly why it has to be
 * structural.
 *
 * A COMPUTATION CANNOT PRODUCE EVIDENCE, OR AUTHORITY
 *
 * `derived_artifact.claim_class` accepts the four classes whose origin is
 * COMPUTATION, and the set is derived from the class contracts rather than
 * listed again. `SOURCE_OBSERVATION` is absent because acquisition is the only
 * path to one. `DECISION` and `EXECUTION_RESULT` are absent because those
 * belong to the action layer. The mining engine's reach is bounded at both
 * ends by the values its column will hold.
 *
 * AND IT CANNOT BE SERVED AS EITHER
 *
 * Refusing the class in the artifact table stops nothing if the serving path
 * can relabel the row on the way out. `served_claim` carries the class it is
 * serving beside the origin it came from, tied to that origin by a composite
 * key, and a CHECK requires them to agree. A graph algorithm's likely
 * dependency cannot be presented as a bill of lading's established one,
 * because `('COMPUTATION', 'SOURCE_OBSERVATION')` is not a pair the constraint
 * carries.
 *
 * A FAILED RUN PRODUCED NOTHING
 *
 * The spec, the run and the artifact are three tables. An artifact carries its
 * run's status denormalised and tied, with a CHECK that it succeeded — so a
 * failed computation cannot leave a result behind, and a retry produces a
 * second run rather than a second artifact. A failure carries a stable
 * identity rather than a message, because a failure nobody can group is a
 * failure nobody can fix.
 *
 * A COMPUTATION CANNOT READ WHAT DID NOT EXIST YET
 *
 * The desk's lookahead technique, for the same reason. An input carries its
 * own time denormalised, tied to the real row by a composite foreign key so
 * the copy cannot differ from the original, and a plain CHECK does the rest.
 *
 * ACYCLICITY IS A CONSEQUENCE, NOT A TRIGGER
 *
 * An artifact may read artifacts computed strictly earlier. Because `<` on a
 * total order admits no cycles, an artifact cannot appear in its own ancestry
 * at any depth — there is no recursive check to write and none to get wrong.
 * If B read A, A finished first, which is also simply true.
 *
 * RIGHTS ARE INHERITED, NEVER WIDENED
 *
 * Computation is not a laundering step for rights any more than it is one for
 * evidence. An artifact's permitted operations are checked against every input
 * it read, and an operation no input carried is refused. One restricted input
 * restricts the result.
 *
 * A THRESHOLD DECLARED AFTER THE RESULT IS NOT A THRESHOLD
 *
 * A validation records what would have counted as passing and when that was
 * declared, and a CHECK requires the declaration to precede the measurement.
 * The pass itself is checked against the numbers: a validation cannot record
 * a pass the metric does not support.
 *
 * A VALIDATION IS DATED, AND THE STATE IS ITS LATEST RECORD
 *
 * An artifact's validation state used to be a free column: FALSIFIED could
 * be written over it at any time, with no instant, over an artifact a
 * coverage assessment had already read as present — and the assessment
 * would be wrong with nothing to say when it became so. Now the validation
 * record is the dated fact and is written once; the artifact carries the
 * outcome and the instant of its latest record, and a deferred guard holds
 * the two together from both sides: a state moved with no record behind it,
 * a record the state does not carry, and a state that is not the latest
 * record's by instant are refused. What reads the state as of an instant
 * (the dossier ledger's assessment) reads the record standing at that
 * instant, and refuses a record backdated behind an assessment that did not
 * know it, the same way it refuses a backdated retraction.
 *
 * AND NOTHING CAN BE COMPUTED AT ALL
 *
 * A run names the release it computed over. There are none — no connector has
 * been lit and admitted records are zero — so the foreign key has nothing to
 * point at and no run can be written. The same structural block the execution
 * ledger carries, for the same missing first fact.
 */
import { ARITHMETIC_CLASSES } from '@/domain/computationCard';
import { PERMITTED_USES } from '@/domain/corpus';
import {
  CLAIM_CLASSES, CLASS_CONTRACTS, DERIVABLE_CLASSES, MINING_CONTRACTS, MINING_KINDS,
  VALIDATION_OUTCOMES, VALIDATION_STATES,
} from '@/domain/discoveryLayer';

/** The classes for which a confidence and a fitted model are meaningful. */
export const FITTED_CLASSES: readonly string[] =
  CLASS_CONTRACTS.filter((entry) => entry.carriesConfidence).map((entry) => entry.class);

/** The classes that reach past the evidence they read, and so need a horizon. */
export const FORWARD_CLASSES: readonly string[] =
  CLASS_CONTRACTS.filter((entry) => entry.aboutTheFuture).map((entry) => entry.class);

/**
 * The permitted (origin, served class) pairs, derived from the class contracts
 * rather than listed. A class is servable from its own origin and no other, so
 * a new class changes what may be served by existing.
 */
export const SERVING_PAIRS: ReadonlyArray<readonly [string, string]> =
  CLASS_CONTRACTS.map((entry) => [entry.origin, entry.class] as const);

const SERVES = SERVING_PAIRS.map(([origin, cls]) => `('${origin}', '${cls}')`).join(', ');

/** The (mining kind, produced class) pairs, likewise derived from the contracts. */
const WORKLOAD_PRODUCES = MINING_CONTRACTS
  .map((contract) => `('${contract.kind}', '${contract.produces}')`).join(', ');

/** How a metric is read. A pass is checked against this, not asserted beside it. */
export const METRIC_DIRECTIONS = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER'] as const;

/** Who may authorize an acquisition. The execution ledger's list, not a second one. */
import { AUTHORIZING_PRINCIPALS } from './executionLedger';
import { quoted } from './ddl';
export { AUTHORIZING_PRINCIPALS };

export const DISCOVERY_LEDGER_DDL = `
-- What would be computed. A definition, not an execution.
CREATE TABLE workload_spec (
  workload_id text PRIMARY KEY,
  mining_kind text NOT NULL CHECK (mining_kind IN (${quoted(MINING_KINDS)})),
  -- Only the classes whose origin is COMPUTATION. Acquisition and the action
  -- layer own the other three, and their values are not in this column.
  produces_class text NOT NULL CHECK (produces_class IN (${quoted(DERIVABLE_CLASSES)})),
  -- What it would read, named as a selector rather than copied as a dataset.
  input_selector jsonb NOT NULL,
  method text NOT NULL CHECK (length(btrim(method)) > 0),
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  implementation_id text NOT NULL CHECK (length(btrim(implementation_id)) > 0),
  implementation_version text NOT NULL CHECK (length(btrim(implementation_version)) > 0),
  output_schema text NOT NULL CHECK (length(btrim(output_schema)) > 0),
  -- How the numbers were produced, which decides whether they reproduce
  -- anywhere but here. The computation card's vocabulary, not a second one.
  arithmetic text NOT NULL CHECK (arithmetic IN (${quoted(ARITHMETIC_CLASSES)})),
  -- The identity of the computation itself: method, parameters and
  -- implementation together. Two specs differing in any of them are two
  -- computations, and the unique index is what makes that true rather than
  -- intended.
  spec_fingerprint text NOT NULL UNIQUE CHECK (spec_fingerprint ~ '^sha256:[a-f0-9]{64}$'),

  CONSTRAINT spec_selector_is_object CHECK (jsonb_typeof(input_selector) = 'object'),
  CONSTRAINT spec_parameters_is_object CHECK (jsonb_typeof(parameters) = 'object'),
  -- A descriptive workload does not emit a prediction. The pairs come from the
  -- mining contracts, so the kinds and what they may produce cannot drift.
  CONSTRAINT spec_kind_produces_its_class CHECK ((mining_kind, produces_class) IN (${WORKLOAD_PRODUCES})),
  UNIQUE (workload_id, produces_class)
);

-- One execution of a spec.
CREATE TABLE workload_run (
  run_id text PRIMARY KEY,
  workload_id text NOT NULL,
  produces_class text NOT NULL,
  -- What it computed over. No release exists, so no run can be written.
  corpus_release_id text NOT NULL REFERENCES releases (release_id),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  input_fingerprint text CHECK (input_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  output_fingerprint text CHECK (output_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  -- A stable identity, not a message. A failure nobody can group is a failure
  -- nobody can fix, which is what a generic "computation failed" produces.
  failure_identity text,

  CONSTRAINT run_spec FOREIGN KEY (workload_id, produces_class)
    REFERENCES workload_spec (workload_id, produces_class),
  CONSTRAINT run_finished_when_not_running CHECK ((status = 'RUNNING') = (completed_at IS NULL)),
  CONSTRAINT run_interval CHECK (completed_at IS NULL OR completed_at >= started_at),
  -- A failure names itself; a success does not carry one.
  CONSTRAINT run_failure_is_identified CHECK ((status = 'FAILED') = (failure_identity IS NOT NULL AND length(btrim(failure_identity)) > 0)),
  -- A run that did not succeed produced no output to fingerprint.
  CONSTRAINT run_output_only_on_success CHECK ((status = 'SUCCEEDED') = (output_fingerprint IS NOT NULL)),
  -- What it read is known as soon as it has read anything, so a finished run
  -- of either kind carries it.
  CONSTRAINT run_input_known_when_finished CHECK (status = 'RUNNING' OR input_fingerprint IS NOT NULL),

  UNIQUE (run_id, status),
  UNIQUE (run_id, produces_class),
  UNIQUE (run_id, completed_at)
);

-- What one successful run produced.
CREATE TABLE derived_artifact (
  artifact_id text PRIMARY KEY,
  run_id text NOT NULL,
  -- Denormalised from the run and tied to it, so the check below is about the
  -- run that actually happened.
  run_status text NOT NULL,
  -- And from the spec, so an artifact cannot claim a class its workload does
  -- not produce.
  claim_class text NOT NULL CHECK (claim_class IN (${quoted(DERIVABLE_CLASSES)})),
  subject text NOT NULL CHECK (length(btrim(subject)) > 0),
  claim text NOT NULL CHECK (length(btrim(claim)) > 0),
  computed_at timestamptz NOT NULL,
  model_id text,
  confidence numeric,
  horizon_ends_at timestamptz,
  -- What may be done with it. Checked against every input; never wider; and
  -- in the corpus's one rights vocabulary, so a source-policy operation name
  -- cannot land here and be compared with a permitted use as if it were one.
  rights text[] NOT NULL DEFAULT '{}',
  validation text NOT NULL DEFAULT 'NOT_VALIDATED' CHECK (validation IN (${quoted(VALIDATION_STATES)})),
  -- From when: the instant of the latest validation record, which the guard
  -- below holds it to. Unvalidated has no instant.
  validated_at timestamptz,
  CONSTRAINT artifact_validation_state_is_dated CHECK ((validation = 'NOT_VALIDATED') = (validated_at IS NULL)),
  -- A check before the result checked nothing.
  CONSTRAINT artifact_validated_after_it_was_computed CHECK (validated_at IS NULL OR validated_at >= computed_at),
  CONSTRAINT artifact_rights_are_permitted_uses CHECK (rights <@ ARRAY[${quoted(PERMITTED_USES)}]::text[]),

  CONSTRAINT artifact_run FOREIGN KEY (run_id, run_status) REFERENCES workload_run (run_id, status),
  -- A failed computation leaves no result behind.
  CONSTRAINT artifact_only_from_a_successful_run CHECK (run_status = 'SUCCEEDED'),
  CONSTRAINT artifact_class_is_the_runs FOREIGN KEY (run_id, claim_class)
    REFERENCES workload_run (run_id, produces_class),

  -- A fitted thing carries the artefact that fitted it; an unfitted one has none.
  CONSTRAINT artifact_fitted_names_model CHECK (
    (claim_class IN (${quoted(FITTED_CLASSES)})) = (model_id IS NOT NULL)
  ),
  CONSTRAINT artifact_fitted_carries_confidence CHECK (
    (claim_class IN (${quoted(FITTED_CLASSES)})) = (confidence IS NOT NULL)
  ),
  -- Strictly between. A fitted model reporting certainty reported a defect.
  CONSTRAINT artifact_confidence_is_uncertain CHECK (
    confidence IS NULL OR (confidence > 0 AND confidence < 1)
  ),
  -- A claim reaching past its evidence says how far.
  CONSTRAINT artifact_forward_claim_has_horizon CHECK (
    (claim_class IN (${quoted(FORWARD_CLASSES)})) = (horizon_ends_at IS NOT NULL)
  ),
  CONSTRAINT artifact_horizon_is_ahead CHECK (
    horizon_ends_at IS NULL OR horizon_ends_at > computed_at
  ),

  UNIQUE (artifact_id, computed_at),
  UNIQUE (artifact_id, claim_class),
  UNIQUE (artifact_id, run_id)
);

-- What an artifact read. One row per record consulted.
CREATE TABLE artifact_input (
  input_id text PRIMARY KEY,
  artifact_id text NOT NULL,
  -- Denormalised from the artifact and tied to it.
  artifact_computed_at timestamptz NOT NULL,
  input_kind text NOT NULL CHECK (input_kind IN ('SOURCE_RECORD', 'DERIVED_ARTIFACT')),

  source_record_id text,
  source_known_at timestamptz,
  input_artifact_id text,
  input_claim_class text,
  input_computed_at timestamptz,

  -- What this input permits. The floor the artifact's own rights are held to.
  input_rights text[] NOT NULL,
  CONSTRAINT input_rights_are_permitted_uses CHECK (input_rights <@ ARRAY[${quoted(PERMITTED_USES)}]::text[]),

  CONSTRAINT input_artifact FOREIGN KEY (artifact_id, artifact_computed_at)
    REFERENCES derived_artifact (artifact_id, computed_at),

  CONSTRAINT input_kind_matches_columns CHECK (
    (input_kind = 'SOURCE_RECORD') = (source_record_id IS NOT NULL)
    AND (input_kind = 'DERIVED_ARTIFACT') = (input_artifact_id IS NOT NULL)
  ),
  CONSTRAINT input_source_columns_together CHECK ((source_record_id IS NULL) = (source_known_at IS NULL)),
  CONSTRAINT input_artifact_columns_together CHECK (
    (input_artifact_id IS NULL AND input_claim_class IS NULL AND input_computed_at IS NULL)
    OR (input_artifact_id IS NOT NULL AND input_claim_class IS NOT NULL AND input_computed_at IS NOT NULL)
  ),

  CONSTRAINT input_source_record FOREIGN KEY (source_record_id, source_known_at)
    REFERENCES corpus_record (record_id, known_at),
  -- A derived input is a real artifact, of the class it says it is. Its class
  -- cannot be misreported here, which is what keeps the ancestry readable.
  CONSTRAINT input_artifact_class FOREIGN KEY (input_artifact_id, input_claim_class)
    REFERENCES derived_artifact (artifact_id, claim_class),
  CONSTRAINT input_artifact_time FOREIGN KEY (input_artifact_id, input_computed_at)
    REFERENCES derived_artifact (artifact_id, computed_at),

  -- Lookahead, closed. A computation cannot have read what was not yet knowable.
  CONSTRAINT input_source_not_ahead CHECK (
    source_known_at IS NULL OR source_known_at <= artifact_computed_at
  ),
  -- Strictly earlier, which is also what makes a cycle impossible at any depth.
  CONSTRAINT input_artifact_computed_earlier CHECK (
    input_computed_at IS NULL OR input_computed_at < artifact_computed_at
  ),
  CONSTRAINT input_not_itself CHECK (input_artifact_id IS DISTINCT FROM artifact_id),
  CONSTRAINT input_once UNIQUE (artifact_id, input_kind, source_record_id, input_artifact_id)
);

-- Whether a result was ever checked, and against what. A dated fact, written
-- once: a later check is a later record, and the artifact's state is the
-- latest of them.
CREATE TABLE artifact_validation (
  validation_id text PRIMARY KEY,
  artifact_id text NOT NULL REFERENCES derived_artifact (artifact_id),
  -- Denormalised from the artifact and tied to it, so the check below is
  -- about the result that was actually computed.
  artifact_computed_at timestamptz NOT NULL,
  method text NOT NULL CHECK (length(btrim(method)) > 0),
  metric text NOT NULL CHECK (length(btrim(metric)) > 0),
  -- A metric with no baseline is a number, not a finding.
  baseline text NOT NULL CHECK (length(btrim(baseline)) > 0),
  direction text NOT NULL CHECK (direction IN (${quoted(METRIC_DIRECTIONS)})),
  result numeric NOT NULL,
  threshold numeric NOT NULL,
  -- When the bar was set, which has to be before the measurement.
  threshold_declared_at timestamptz NOT NULL,
  validated_at timestamptz NOT NULL,
  passed boolean NOT NULL,
  -- The state the artifact holds from this instant: the method that passed,
  -- or FALSIFIED. Unvalidated is the absence of a record, not an outcome.
  outcome text NOT NULL CHECK (outcome IN (${quoted(VALIDATION_OUTCOMES)})),
  evidence text NOT NULL CHECK (length(btrim(evidence)) > 0),

  CONSTRAINT validation_artifact FOREIGN KEY (artifact_id, artifact_computed_at)
    REFERENCES derived_artifact (artifact_id, computed_at),
  -- A check before the result checked nothing.
  CONSTRAINT validation_after_the_computation CHECK (validated_at >= artifact_computed_at),
  -- A threshold chosen after seeing the result is not a threshold.
  CONSTRAINT validation_threshold_declared_first CHECK (threshold_declared_at <= validated_at),
  -- And the pass is the numbers, not a claim beside them.
  CONSTRAINT validation_pass_matches_the_metric CHECK (
    passed = CASE direction
      WHEN 'HIGHER_IS_BETTER' THEN result >= threshold
      ELSE result <= threshold
    END
  ),
  -- And the outcome is the pass: a refutation that passed, or a pass that
  -- refuted, is a contradiction.
  CONSTRAINT validation_outcome_matches_the_pass CHECK (passed = (outcome <> 'FALSIFIED')),
  -- One record per artifact per instant, so "the latest" names one row.
  CONSTRAINT validation_once_per_instant UNIQUE (artifact_id, validated_at)
);

-- What was handed to a reader, and as what.
CREATE TABLE served_claim (
  claim_id text PRIMARY KEY,
  served_at timestamptz NOT NULL,
  origin_kind text NOT NULL CHECK (origin_kind IN (${quoted(CLASS_CONTRACTS.map((entry) => entry.origin).filter((origin, index, all) => all.indexOf(origin) === index))})),
  -- The class the reader is told this is.
  served_as text NOT NULL CHECK (served_as IN (${quoted(CLAIM_CLASSES)})),

  source_record_id text REFERENCES corpus_record (record_id),
  artifact_id text,
  -- Denormalised from the artifact and tied to it, so the pair check below is
  -- about the class the row actually has.
  artifact_class text,

  CONSTRAINT served_origin_columns CHECK (
    (origin_kind = 'ACQUISITION') = (source_record_id IS NOT NULL)
    AND (origin_kind = 'COMPUTATION') = (artifact_id IS NOT NULL)
  ),
  CONSTRAINT served_artifact_columns_together CHECK ((artifact_id IS NULL) = (artifact_class IS NULL)),
  CONSTRAINT served_artifact FOREIGN KEY (artifact_id, artifact_class)
    REFERENCES derived_artifact (artifact_id, claim_class),

  -- The whole of it. A class is servable from its own origin and no other.
  CONSTRAINT served_class_matches_origin CHECK ((origin_kind, served_as) IN (${SERVES})),
  -- And a derived claim is served as the class it carries, not another derived one.
  CONSTRAINT served_class_is_the_artifacts_own CHECK (
    artifact_class IS NULL OR served_as = artifact_class
  )
);

-- What the corpus noticed it could not see.
CREATE TABLE gap_detection (
  gap_id text PRIMARY KEY,
  artifact_id text NOT NULL REFERENCES derived_artifact (artifact_id),
  missing text NOT NULL CHECK (length(btrim(missing)) > 0),
  -- Why acquiring it would be worth anything. A gap with no expected reduction
  -- is a wish, and the ranking it feeds would be arbitrary.
  expected_uncertainty_reduction numeric NOT NULL CHECK (expected_uncertainty_reduction > 0),
  detected_at timestamptz NOT NULL
);

-- And what it proposes be done about it. A proposal, and only ever a proposal.
CREATE TABLE acquisition_proposal (
  proposal_id text PRIMARY KEY,
  gap_id text NOT NULL REFERENCES gap_detection (gap_id),
  target_source text NOT NULL CHECK (length(btrim(target_source)) > 0),
  proposed_at timestamptz NOT NULL,
  standing text NOT NULL CHECK (standing IN ('PROPOSED', 'AUTHORIZED', 'REFUSED')),
  -- An agent is not a value this column holds, the same as in the execution
  -- ledger and for the same reason.
  authorized_by_kind text CHECK (authorized_by_kind IN (${quoted(AUTHORIZING_PRINCIPALS)})),
  authorized_by text,
  authorized_at timestamptz,
  refusal_reason text,

  -- An authorization names who granted it; anything else names nobody.
  CONSTRAINT proposal_authorized_names_a_principal CHECK (
    (standing = 'AUTHORIZED') = (authorized_by_kind IS NOT NULL AND authorized_by IS NOT NULL AND authorized_at IS NOT NULL)
  ),
  CONSTRAINT proposal_refusal_has_a_reason CHECK (
    (standing = 'REFUSED') = (refusal_reason IS NOT NULL AND length(btrim(refusal_reason)) > 0)
  ),
  CONSTRAINT proposal_authorized_after_proposal CHECK (authorized_at IS NULL OR authorized_at >= proposed_at),
  UNIQUE (proposal_id, standing)
);

CREATE INDEX artifact_input_by_artifact ON artifact_input (artifact_id);
CREATE INDEX run_by_workload ON workload_run (workload_id, started_at);
CREATE INDEX artifact_by_run ON derived_artifact (run_id);
CREATE INDEX validation_by_artifact ON artifact_validation (artifact_id, validated_at);
CREATE INDEX proposal_by_gap ON acquisition_proposal (gap_id);
`;

/**
 * The guards that cannot be CHECKs.
 *
 * Both span rows. "An artifact read at least one record" is deferred to
 * commit, because the artifact and its inputs are written together. "An
 * artifact's rights are no wider than every input's" is checked as each input
 * arrives and again at commit, because widening can happen from either side.
 */
export const DISCOVERY_LEDGER_GUARDS = `
CREATE FUNCTION refuse_artifact_without_inputs() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM artifact_input WHERE artifact_id = NEW.artifact_id) THEN
    RAISE EXCEPTION 'artifact_read_nothing';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER artifact_must_read_something
  AFTER INSERT ON derived_artifact
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_artifact_without_inputs();

-- Rights are an intersection. An operation the artifact claims that any one of
-- its inputs does not carry is a widening, and computation does not widen.
CREATE FUNCTION refuse_rights_wider_than_inputs() RETURNS trigger AS $$
DECLARE
  target text;
  widened text;
BEGIN
  target := CASE TG_TABLE_NAME WHEN 'derived_artifact' THEN NEW.artifact_id ELSE NEW.artifact_id END;
  SELECT operation INTO widened
  FROM (SELECT unnest(rights) AS operation FROM derived_artifact WHERE artifact_id = target) AS claimed
  WHERE EXISTS (
    SELECT 1 FROM artifact_input WHERE artifact_id = target AND NOT (claimed.operation = ANY (input_rights))
  )
  LIMIT 1;
  IF widened IS NOT NULL THEN
    RAISE EXCEPTION 'artifact_rights_wider_than_inputs:%', widened;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER artifact_rights_within_inputs
  AFTER INSERT OR UPDATE ON derived_artifact
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_rights_wider_than_inputs();

CREATE CONSTRAINT TRIGGER input_rights_bound_artifact
  AFTER INSERT OR UPDATE ON artifact_input
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_rights_wider_than_inputs();

-- The artifact's validation state is its latest record. The record and the
-- state are written in one transaction and checked at commit from both
-- sides: a state moved with no record behind it, a record the state does
-- not carry, and a state that is not the latest record's are all refused.
-- "Latest" is by instant, not by arrival: a record dated earlier than one
-- already standing goes in as history and does not become the state.
CREATE FUNCTION refuse_artifact_state_unlike_its_validation() RETURNS trigger AS $$
DECLARE
  art derived_artifact%ROWTYPE;
  latest artifact_validation%ROWTYPE;
BEGIN
  SELECT * INTO art FROM derived_artifact WHERE artifact_id = NEW.artifact_id;
  IF art.artifact_id IS NULL THEN
    RETURN NEW; -- the foreign key refuses this
  END IF;
  SELECT * INTO latest FROM artifact_validation WHERE artifact_id = art.artifact_id ORDER BY validated_at DESC LIMIT 1;
  IF latest.validation_id IS NULL THEN
    IF art.validation <> 'NOT_VALIDATED' THEN
      RAISE EXCEPTION 'artifact_validation_is_not_its_latest_record:%:% at % recorded, no validation record', art.artifact_id, art.validation, art.validated_at;
    END IF;
  ELSIF art.validation <> latest.outcome OR art.validated_at IS DISTINCT FROM latest.validated_at THEN
    RAISE EXCEPTION 'artifact_validation_is_not_its_latest_record:%:% at % recorded, % at % from %', art.artifact_id, art.validation, art.validated_at, latest.outcome, latest.validated_at, latest.validation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER artifact_state_is_its_latest_validation
  AFTER INSERT OR UPDATE OF validation, validated_at ON derived_artifact
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_artifact_state_unlike_its_validation();

CREATE CONSTRAINT TRIGGER validation_is_the_artifacts_state
  AFTER INSERT ON artifact_validation
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_artifact_state_unlike_its_validation();

-- Written once. A validation record is a dated fact; a later check is a
-- later record, and what it moves is the artifact's state, not the history.
CREATE FUNCTION refuse_rewriting_a_validation_record() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'validation_is_written_once:% of %', TG_OP, OLD.validation_id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validation_is_written_once BEFORE UPDATE OR DELETE ON artifact_validation
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_validation_record();
`;

