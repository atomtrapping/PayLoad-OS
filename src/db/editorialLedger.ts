/**
 * The newsroom, in the database.
 *
 * `src/domain/editorialPlane.ts` states the rules. The ones that cost money or
 * credibility when broken quietly are constraints.
 *
 * THE CIRCLE THAT WOULD CLOSE
 *
 * The firm publishes a finding. Another account repeats it. Acquisition sees a
 * second source and admits it. The corpus now holds two independent-looking
 * sources for a claim it invented, and the claim gets more confident every time
 * it is quoted. Nothing about that is deliberate and every step is reasonable,
 * which is exactly why it needs a row-level refusal rather than a reviewer.
 *
 * So an observation carries the finding it descends from, when it descends from
 * one, and a corroboration carries the finding it is offered in support of. A
 * plain CHECK compares them: an observation cannot corroborate the finding it
 * came from. Both columns are tied to real rows by composite keys, so neither
 * can be misreported to slip past the comparison.
 *
 * A POST WITH NO ARTICLE BEHIND IT
 *
 * A syndicated post names the archived article it distributes. The archive is
 * the only channel that may originate, which is what "a platform is a channel,
 * not the archive" means once it stops being a slogan: a claim published where
 * the firm does not control the record has no address to correct.
 *
 * THE APPROVAL IS OF A MESSAGE, FOR A CHANNEL
 *
 * A release carries the message itself — headline, claims, chart, qualifiers
 * and the channel's own text, each a required key — and the digest of it, and
 * the channel it is for. The approval is an authorization in the execution
 * ledger of that digest, tied by composite key, and one approval releases one
 * message. Distribution carries the digest and the channel of what actually
 * went out, tied to the release by both. A rewritten headline is a different
 * digest, so it is a different message, so it needs its own approval; the
 * post is a different message from the article, for a different channel, so
 * it is reviewed as itself rather than inheriting the article's review.
 *
 * FOUR QUESTIONS BEFORE ANY RELEASE
 *
 * Editorial, rights, privacy, conflict: each a row by a named reviewer with a
 * pass or a fail, and a trigger refuses a release for a candidate that does
 * not have all four passed. A review packet with a question unanswered is a
 * packet with a hole where the answer would go.
 *
 * AND NOTHING HAS BEEN PUBLISHED
 *
 * Against the real corpus a release requires a reviewed finding, and no
 * finding exists because nothing has been mined. The demonstration rests on
 * the demonstration run, and every row it writes says so.
 */
import { quoted } from './ddl';
import {
  CHANNEL_KINDS, EDITORIAL_STAGES, NEWSROOM_CLASSES, POST_KINDS, PUBLICATION_CLASSES,
  REVIEW_DIMENSIONS,
} from '@/domain/editorialPlane';

/** What a reviewed message carries, and every key is required. */
export const MESSAGE_PARTS = ['headline', 'claims', 'chart', 'qualifiers', 'channelText'] as const;

export const EDITORIAL_LEDGER_DDL = `
-- A finding worth telling somebody about, resting on something the corpus computed.
CREATE TABLE story_candidate (
  candidate_id text PRIMARY KEY,
  artifact_id text NOT NULL,
  artifact_class text NOT NULL,
  beat text NOT NULL CHECK (length(btrim(beat)) > 0),
  stage text NOT NULL CHECK (stage IN (${quoted(EDITORIAL_STAGES)})),
  found_at timestamptz NOT NULL,

  CONSTRAINT candidate_artifact FOREIGN KEY (artifact_id, artifact_class)
    REFERENCES derived_artifact (artifact_id, claim_class),
  UNIQUE (candidate_id, artifact_id)
);

-- The four questions a review actually answers, each by a named person.
CREATE TABLE editorial_review (
  review_id text PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES story_candidate (candidate_id),
  dimension text NOT NULL CHECK (dimension IN (${quoted(REVIEW_DIMENSIONS)})),
  reviewer text NOT NULL CHECK (length(btrim(reviewer)) > 0),
  -- What the firm holds, and who benefits if this is believed. Non-null on the
  -- conflict dimension because that is the one it is for.
  holdings_reviewed text,
  passed boolean NOT NULL,
  reviewed_at timestamptz NOT NULL,

  CONSTRAINT review_conflict_names_the_holdings CHECK (
    dimension <> 'CONFLICT' OR (holdings_reviewed IS NOT NULL AND length(btrim(holdings_reviewed)) > 0)
  ),
  CONSTRAINT review_once_per_dimension UNIQUE (candidate_id, dimension)
);

-- What was released: one message, for one channel, at the version that was reviewed.
CREATE TABLE editorial_release (
  editorial_release_id text PRIMARY KEY,
  candidate_id text NOT NULL,
  artifact_id text NOT NULL,
  -- A newsroom produces one class. The other three are not values it holds.
  publication_class text NOT NULL CHECK (publication_class IN (${quoted(NEWSROOM_CLASSES)})),
  version integer NOT NULL CHECK (version >= 1),
  -- The digest of the exact message that was reviewed.
  message_digest text NOT NULL CHECK (message_digest ~ '^sha256:[a-f0-9]{64}$'),
  -- What remains unknown. Never blank: an article listing only what is settled
  -- describes a settled question, and those are rarely worth publishing.
  still_unknown text NOT NULL CHECK (length(btrim(still_unknown)) > 0),
  released_at timestamptz NOT NULL,
  -- The channel this message is for. The article and the post are two messages.
  channel text NOT NULL CHECK (channel IN (${quoted(CHANNEL_KINDS)})),
  -- The message itself: headline, claims, chart, qualifiers and the channel's
  -- own text. The digest above is over this, and the review was of this.
  message jsonb NOT NULL,
  -- The approval, in the execution ledger, of that digest.
  authorization_id text NOT NULL,

  CONSTRAINT release_candidate FOREIGN KEY (candidate_id, artifact_id)
    REFERENCES story_candidate (candidate_id, artifact_id),
  CONSTRAINT release_message_has_its_parts CHECK (
    jsonb_typeof(message) = 'object' AND message ?& array[${quoted(MESSAGE_PARTS)}]
  ),
  CONSTRAINT release_approved_as_this_message FOREIGN KEY (authorization_id, message_digest)
    REFERENCES execution_authorization (authorization_id, action_digest),
  -- One approval releases one message.
  CONSTRAINT editorial_release_authorization_once UNIQUE (authorization_id),
  CONSTRAINT editorial_release_version_once UNIQUE (candidate_id, channel, version),
  UNIQUE (editorial_release_id, message_digest),
  UNIQUE (editorial_release_id, artifact_id),
  UNIQUE (editorial_release_id, message_digest, channel)
);

-- Where it went. The archive originates; everything else distributes.
CREATE TABLE channel_publication (
  channel_publication_id text PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN (${quoted(CHANNEL_KINDS)})),
  post_kind text NOT NULL CHECK (post_kind IN (${quoted(POST_KINDS)})),
  editorial_release_id text NOT NULL,
  -- The digest of what actually went out, tied to the reviewed message below.
  message_digest text NOT NULL,
  -- Present only on a syndicated post: the archived article it distributes.
  archived_publication_id text REFERENCES channel_publication (channel_publication_id),
  -- An automated reply needs prior written approval from the platform.
  platform_approval text,
  published_at timestamptz NOT NULL,

  -- The approval was of a message, for a channel. A different digest is a
  -- different message; the article's digest on the post's channel is a
  -- message nobody reviewed for that channel.
  CONSTRAINT channel_carries_the_reviewed_message FOREIGN KEY (editorial_release_id, message_digest, channel)
    REFERENCES editorial_release (editorial_release_id, message_digest, channel),
  -- A post with no article behind it is a claim with no address.
  CONSTRAINT only_the_archive_originates CHECK (
    (channel = 'ARCHIVE') = (archived_publication_id IS NULL)
  ),
  CONSTRAINT automated_reply_is_approved CHECK (
    (post_kind = 'AUTOMATED_REPLY') = (platform_approval IS NOT NULL AND length(btrim(platform_approval)) > 0)
  )
);

-- An observation the acquisition layer took in, and where it came from.
CREATE TABLE external_observation (
  observation_id text PRIMARY KEY,
  source_account text NOT NULL CHECK (length(btrim(source_account)) > 0),
  says text NOT NULL CHECK (length(btrim(says)) > 0),
  -- The finding this observation descends from, when it descends from one.
  -- Null means genuinely independent; a repetition keeps its ancestry here.
  descends_from_artifact_id text,
  descends_via_release_id text,
  observed_at timestamptz NOT NULL,

  -- The ancestry as a value that is never null, GENERATED so a writer cannot
  -- set it inconsistently with the column above.
  --
  -- This exists because the first version of this table tied the corroboration
  -- to a nullable pair, and a foreign key under the default MATCH SIMPLE is not
  -- checked at all when any of its columns is null. Writing NULL therefore
  -- laundered the ancestry straight past the key that was supposed to preserve
  -- it — the exact failure the table is for, available to anyone who left a
  -- field blank. A sentinel that is never null closes it, and an artifact id
  -- can never collide with it.
  ancestry_key text GENERATED ALWAYS AS (coalesce(descends_from_artifact_id, 'INDEPENDENT')) STORED,

  CONSTRAINT observation_ancestry FOREIGN KEY (descends_via_release_id, descends_from_artifact_id)
    REFERENCES editorial_release (editorial_release_id, artifact_id),
  CONSTRAINT observation_ancestry_columns_together CHECK (
    (descends_from_artifact_id IS NULL) = (descends_via_release_id IS NULL)
  ),
  UNIQUE (observation_id, ancestry_key)
);

-- An observation offered in support of a finding.
CREATE TABLE corroboration (
  corroboration_id text PRIMARY KEY,
  observation_id text NOT NULL,
  -- Denormalised from the observation and tied, so the comparison below is
  -- about the ancestry the observation actually has. Never null, so the tie is
  -- actually enforced: a nullable one would not be.
  observation_ancestry_key text NOT NULL,
  -- The finding it is offered in support of.
  corroborates_artifact_id text NOT NULL,
  corroborates_artifact_class text NOT NULL,
  offered_at timestamptz NOT NULL,

  CONSTRAINT corroboration_observation FOREIGN KEY (observation_id, observation_ancestry_key)
    REFERENCES external_observation (observation_id, ancestry_key),
  CONSTRAINT corroboration_artifact FOREIGN KEY (corroborates_artifact_id, corroborates_artifact_class)
    REFERENCES derived_artifact (artifact_id, claim_class),

  -- The circle, broken. Being repeated is not being confirmed: a finding quoted
  -- by five accounts has one source, and an observation that descends from a
  -- finding cannot be evidence for it.
  CONSTRAINT repetition_is_not_corroboration CHECK (
    observation_ancestry_key <> corroborates_artifact_id
  )
);

CREATE INDEX release_by_candidate ON editorial_release (candidate_id, channel, version);
CREATE INDEX channel_by_release ON channel_publication (editorial_release_id);
CREATE INDEX corroboration_by_artifact ON corroboration (corroborates_artifact_id);
`;

/**
 * The guard that cannot be a CHECK: all four questions answered, and answered
 * yes, before a release of that candidate goes in. Spans rows, so a trigger.
 */
export const EDITORIAL_LEDGER_GUARDS = `
CREATE FUNCTION refuse_release_without_every_review_passed() RETURNS trigger AS $$
DECLARE
  passed_dimensions integer;
BEGIN
  SELECT count(DISTINCT dimension) INTO passed_dimensions
  FROM editorial_review WHERE candidate_id = NEW.candidate_id AND passed;
  IF passed_dimensions < ${REVIEW_DIMENSIONS.length} THEN
    RAISE EXCEPTION 'release_before_every_review_passed:%_of_${REVIEW_DIMENSIONS.length}', passed_dimensions;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER editorial_release_reviewed
  BEFORE INSERT ON editorial_release
  FOR EACH ROW EXECUTE FUNCTION refuse_release_without_every_review_passed();
`;

/** The classes the newsroom column will not hold, for the drift check. */
export const REFUSED_PUBLICATION_CLASSES: readonly string[] =
  PUBLICATION_CLASSES.filter((cls) => !NEWSROOM_CLASSES.includes(cls));
