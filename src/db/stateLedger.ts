/**
 * The three meanings of state, in the database.
 *
 * ONE PARENT, THREE VALUES, SO THE KEY ACTUALLY DISCRIMINATES
 *
 * The tempting shape is three tables, each pinning its own kind to a literal,
 * with children carrying a denormalised kind column tied by a composite key.
 * That looks exactly like this repository's signature technique and performs
 * none of it: a parent whose kind column can only ever hold one value gives the
 * child's copy nothing to disagree with, so the CHECK comparing them can never
 * fire and a test naming it would be passing off the foreign key.
 *
 * So there is one `state_subject` table whose kind column really does hold all
 * three. A reading tied to a subject of the wrong kind is a row somebody can
 * write, and it is a row the key refuses.
 *
 * A CORRECTION MOVES KNOWLEDGE, NOT THE EVENT
 *
 * A superseding estimate carries a strictly later evidence time and the SAME
 * described period, and both are checked. An estimate that "corrects" a figure
 * by restating which month it is about has answered a different question and
 * kept the old question's audience — which is a harder error to notice than a
 * wrong number, and worse, because the wrong number would eventually be
 * contradicted by something.
 *
 * AN ESTIMATE SAYS WHERE IT DOES NOT APPLY
 *
 * Non-null and non-blank, because nothing else in this system carried it. A
 * horizon bounds time; regime, region, population and range are not time, and
 * an estimate silent about them will be used outside its fit by a reader with
 * no way to detect it.
 *
 * A CONTRADICTION IS RECORDED, NOT REFUSED
 *
 * The inversion worth noticing. Canonical means authoritative for the record
 * rather than true about the world, so two accepted revisions disagreeing is a
 * legitimate state — and the constraint is that the disagreement must be
 * WRITTEN DOWN, not that it cannot happen. A schema that refused contradictions
 * would force a writer to pick one and lose the fact that there was a choice.
 *
 * AND NOTHING IS DECLARED
 *
 * No subject exists, because nothing has been admitted about one.
 */
import { quoted } from './ddl';
import {
  OBSERVATION_BASES, PHYSICAL_BLOCKS, STATE_KINDS,
} from '@/domain/stateKinds';

export const STATE_LEDGER_DDL = `
-- The one parent whose kind column holds all three, so the keys below
-- discriminate rather than decorate.
CREATE TABLE state_subject (
  subject_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN (${quoted(STATE_KINDS)})),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  -- Which block of the physical vector, on a physical subject only.
  block text CHECK (block IN (${quoted(PHYSICAL_BLOCKS)})),
  declared_at timestamptz NOT NULL,

  CONSTRAINT subject_block_only_on_physical CHECK ((kind = 'PHYSICAL') = (block IS NOT NULL)),
  UNIQUE (subject_id, kind)
);

-- A reading about the world, with what it actually rests on.
CREATE TABLE variable_reading (
  reading_id text PRIMARY KEY,
  subject_id text NOT NULL,
  -- Denormalised and tied. The parent holds three kinds, so this can disagree
  -- and the key can refuse it.
  subject_kind text NOT NULL,
  -- A document assertion, a direct observation and a modelled estimate do not
  -- acquire identical standing, so the basis travels with the reading.
  basis text NOT NULL CHECK (basis IN (${quoted(OBSERVATION_BASES)})),
  reads text NOT NULL CHECK (length(btrim(reads)) > 0),
  observed_at timestamptz NOT NULL,

  CONSTRAINT reading_subject FOREIGN KEY (subject_id, subject_kind) REFERENCES state_subject (subject_id, kind),
  -- A reading is about the world. An estimate is not a reading of one.
  CONSTRAINT reading_is_about_the_physical CHECK (subject_kind = 'PHYSICAL')
);

-- What the evidence supports, at a described period, from evidence known by a time.
CREATE TABLE state_estimate (
  estimate_id text PRIMARY KEY,
  subject_id text NOT NULL,
  subject_kind text NOT NULL,
  -- The period this is about.
  describes_at timestamptz NOT NULL,
  -- The time by which the evidence was available. A correction moves this one.
  evidence_known_by timestamptz NOT NULL,
  evidence_snapshot text NOT NULL CHECK (evidence_snapshot ~ '^sha256:[a-f0-9]{64}$'),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  uncertainty text NOT NULL CHECK (length(btrim(uncertainty)) > 0),
  -- Where this does NOT apply. Nothing in this system carried it before, and a
  -- horizon bounds time rather than regime, region, population or range.
  applicability_limit text NOT NULL CHECK (length(btrim(applicability_limit)) > 0),

  supersedes_estimate_id text,
  supersedes_describes_at timestamptz,
  supersedes_evidence_known_by timestamptz,

  CONSTRAINT estimate_subject FOREIGN KEY (subject_id, subject_kind) REFERENCES state_subject (subject_id, kind),
  -- An estimate is about the world, not about another estimate or a record.
  CONSTRAINT estimate_is_about_the_physical CHECK (subject_kind = 'PHYSICAL'),

  CONSTRAINT estimate_supersession_columns_together CHECK (
    (supersedes_estimate_id IS NULL AND supersedes_describes_at IS NULL AND supersedes_evidence_known_by IS NULL)
    OR (supersedes_estimate_id IS NOT NULL AND supersedes_describes_at IS NOT NULL AND supersedes_evidence_known_by IS NOT NULL)
  ),
  CONSTRAINT estimate_supersedes FOREIGN KEY (supersedes_estimate_id, supersedes_describes_at, supersedes_evidence_known_by)
    REFERENCES state_estimate (estimate_id, describes_at, evidence_known_by),

  -- A correction knows more, later. This also refuses an estimate superseding
  -- itself, since a time cannot strictly follow itself.
  CONSTRAINT estimate_correction_knows_later CHECK (
    supersedes_evidence_known_by IS NULL OR supersedes_evidence_known_by < evidence_known_by
  ),
  -- And it is about the same period. Restating which month it concerns answers
  -- a different question while keeping the old question's audience.
  CONSTRAINT estimate_correction_keeps_the_period CHECK (
    supersedes_describes_at IS NULL OR supersedes_describes_at = describes_at
  ),

  UNIQUE (estimate_id, describes_at, evidence_known_by)
);

-- What the system has recorded and committed, per governed scope.
CREATE TABLE accepted_revision (
  revision_id text PRIMARY KEY,
  scope_subject_id text NOT NULL,
  scope_kind text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  succeeds_revision bigint,
  event_admitted text NOT NULL CHECK (length(btrim(event_admitted)) > 0),
  accepted_at timestamptz NOT NULL,

  CONSTRAINT revision_scope FOREIGN KEY (scope_subject_id, scope_kind) REFERENCES state_subject (subject_id, kind),
  -- Only an operational subject has revisions. The world does not have versions.
  CONSTRAINT revision_is_operational CHECK (scope_kind = 'OPERATIONAL'),
  CONSTRAINT revision_succeeds_an_earlier_one CHECK (succeeds_revision IS NULL OR succeeds_revision < revision),
  -- A line opens at zero, and only at zero. This is the half that survives:
  -- a revision at 0 with a predecessor would need one below zero, which the
  -- column already refuses.
  CONSTRAINT revision_line_opens_at_zero CHECK (succeeds_revision IS NOT NULL OR revision = 0),
  CONSTRAINT revision_once_per_scope UNIQUE (scope_subject_id, revision),
  UNIQUE (revision_id, scope_subject_id, revision)
);

-- Two accepted revisions that disagree. Recorded, because a schema that refused
-- this would force a writer to pick one and lose that there was a choice.
CREATE TABLE recorded_contradiction (
  contradiction_id text PRIMARY KEY,
  scope_subject_id text NOT NULL,
  left_revision bigint NOT NULL,
  right_revision bigint NOT NULL,
  disagreement text NOT NULL CHECK (length(btrim(disagreement)) > 0),
  noticed_at timestamptz NOT NULL,

  CONSTRAINT contradiction_left FOREIGN KEY (scope_subject_id, left_revision)
    REFERENCES accepted_revision (scope_subject_id, revision),
  CONSTRAINT contradiction_right FOREIGN KEY (scope_subject_id, right_revision)
    REFERENCES accepted_revision (scope_subject_id, revision),
  -- A revision does not contradict itself.
  CONSTRAINT contradiction_is_between_two CHECK (left_revision <> right_revision)
);

CREATE INDEX reading_by_subject ON variable_reading (subject_id, observed_at);
CREATE INDEX estimate_by_subject ON state_estimate (subject_id, describes_at, evidence_known_by);
CREATE INDEX revision_by_scope ON accepted_revision (scope_subject_id, revision);
`;

