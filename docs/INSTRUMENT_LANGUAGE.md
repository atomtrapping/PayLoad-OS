# The instrument language

The design direction, and the reason it fits.

## What the references have in common

The board is a frequency counter, a pen plotter, an air-traffic screen, a LiDAR
return, a MAGI panel, a plotted star map, a terminal printout. Not a product
dashboard among them. Four things are true of all of them, and all four are
already this system's doctrine — which is why this direction was taken as-is
rather than softened into a house style.

**Black is the default state, not a background.** A plotter leaves the paper
alone; a phosphor screen leaves the dark alone. Nothing is drawn where nothing
is held. That is SILENCE-IS-NOT-ZERO as a ground rule: emptiness on these
surfaces means the corpus holds nothing there. No surface fills space to look
busy, and no panel renders a placeholder shaped like a value.

**Line, not fill.** Frames are one hairline. A fill claims that something
occupies the area, so fills are reserved for quantities actually measured and
are drawn as discrete cells. A segmented meter cannot imply a precision between
its cells; a smooth gradient bar always does.

**Colour is a channel.** On an air-traffic screen the hue says which class of
traffic; on a LiDAR return it says elevation. It never says "this panel is
important". Here it says what kind of knowledge a thing is, and nothing else.

**The frame carries provenance.** Every reference prints its own serial, session
ID and coordinates into the chrome. So does this: a panel over corpus state
stamps the release, the seat and the knowledge time into its own border, where
it cannot be cropped away from the number it qualifies.

## The epistemic scale

`src/domain/epistemic.ts`. Six states, one scale, every surface.

| state | hue | second channel | means |
| --- | --- | --- | --- |
| `MEASURED` | `#3df08f` | solid | read from a source; somebody observed it |
| `DERIVED` | `#6fd7e8` | solid | computed here from held records; reproducible, not observed |
| `DECLARED` | `#e8b53a` | solid | a party asserts it; carried with their identity, not checked |
| `UNKNOWN` | `#98a1ae` | **dashed, hollow** | not readable from here |
| `REFUSED` | `#ff7a5c` | solid | a gate declined; the reason travels with it |
| `WITHDRAWN` | `#b795f2` | **double rule** | support removed, nothing put in its place |

Every value is ≥ 6.3:1 against every workspace ground, measured rather than
judged by eye. Colour is never the only channel: each state also carries a
stroke treatment in CSS and its own word in the markup, so the scale survives a
monochrome screen, a colour-blind reader and a printed page.

### It is a projection, not a seventh vocabulary

The estate already has closed vocabularies. Adding a parallel set of states
beside them would be the drift the operating rules forbid. So the scale is
declared as `Record<Vocabulary, Epistemic>` maps from the vocabularies that
exist — record status, layer state, field presence, projection outcome, the
admitted reading. The compiler holds each map exhaustive, which is stronger than
a test: adding a state to the domain does not fail a check, it fails to build
until somebody decides how the new state is drawn.

Two mappings carry doctrine:

- **`RETRACTED` and `SUPERSEDED` draw as `WITHDRAWN`, never as `REFUSED`.** A
  retraction removes support and puts nothing in its place; a refusal is a gate
  declining. One colour for both would flatten WITHDRAWN-IS-NOT-FALSE at the
  last step, after every layer beneath it kept them apart. They are also told
  apart without colour: a double rule against a solid one.
- **An unreadable count is `UNKNOWN`; a zero that was read is `MEASURED`.** The
  compression derivation's rule, applied to pixels.

### What is deliberately not mapped

Ruling status — draft, evaluating, pending, admitted with conditions, refused,
superseded, **revoked** — is not projected onto this scale and must not be. The
scale answers *what kind of knowledge is this*; ruling status answers *what did
an adjudicator decide*. Different questions, and rule 3 keeps REVOKED distinct
from a withdrawal and from an adverse finding. Those statuses keep their own
tokens.

## The marks

`src/app/globals.css`, and `src/components/hud/Instrument.tsx` for the React
side. Five marks, because the references get their density from repeating a few
of them rather than from a widget per panel.

- **`Panel`** — one hairline and two corner registration ticks. `state` tints the
  ticks from the scale; without one the panel is chrome and takes no hue.
- **`Rule`** — a label, a hairline carrying to the edge, and room for a state
  word. Used for every section beginning, in the inspector, the navigation rail
  and the panels alike, so they read as one instrument.
- **`Readout`** — a tiny caps label and a mono value. **It enforces one rule
  rather than describing it: a value that is `UNKNOWN` is drawn as unknown
  whatever the caller passed.** A surface cannot label an unreadable count as
  measured, by mistake or otherwise. An unknown prints the word — never a digit,
  never a dash, because a dash in a column of numbers reads as a zero.
- **`Segments`** — a meter of discrete cells. The empty cells are drawn, so the
  denominator is visible rather than implied; a bar that draws only its filled
  part asks the reader to guess the scale. With no reading, the whole scale is
  dashed: an empty continuous bar reads as a measured zero and a dashed one does
  not.
- **The stamp** — provenance printed into the frame.

The registration ground is a grid at one pitch on the working surface only. The
rail and the top bar stay flat; a grid behind the navigation competes with what
the operator came to read. It matters most where a surface is empty — an empty
region then reads as ruled paper rather than as a loading state, and on these
surfaces an empty region is a fact about the corpus.

## What stayed out

Glass, bloom, gradient fills, radial "system status" gauges and looping ambient
animation. The first reference board had them; the second did not, and the
second is the one this follows. An instrument earns density by labelling
everything in it. A film HUD spends light on implying competence it has not
demonstrated, which on this estate would be a rendering that asserts more than
the corpus holds — the exact failure the operator instrument's two rules exist
to prevent.

Decoration takes no hue. A frame, a rule, a grid and a tick draw from the
neutral border tokens, because a surface that colours its chrome has spent the
channel that was supposed to mean something.

## The finish pass

Applied after the language landed, once the estate could be looked at whole.

**No rounded corners.** Every reference is hard-edged. The three radius tokens
are held at zero rather than deleted, so a surface that ever needs one has to
name it; Tailwind's literal `rounded` and `rounded-full` are outranked by one
unlayered rule, which spared 147 class edits. The browser's own default radius
on selects is squared too.

**Every panel is a frame.** The general surfaces and the inspector carry the
same two corner registration marks as the panels built for the language, so a
card on any page reads as the same instrument. The marks sit inside the
hairline: the inspector scrolls, and a mark drawn outside its edge would be
clipped by the container it belongs to.

**Status words are chips.** Mono, uppercase, spaced, square. The DOM text is
unchanged, so nothing a screen reader announces changed; what changed is that a
status now reads as an instrument's state word rather than a web badge.

**Record status draws from the scale.** `RecordStatusPill` had a colour map of
its own, and it pointed `RETRACTED` at the ruling-revoked token. That was
WITHDRAWN-IS-NOT-FALSE flattened at the pixel, after every layer beneath had
kept it. The map now carries label, glyph and meaning only; the hue is the
epistemic scale's, so a retracted record is violet with a double rule and never
in the refusal family. Superseded and retracted share that state — both are
support removed — and stay told apart by glyph and word.

**Motion is opacity only.** The inspector's entrance slid up six pixels. A
slide is a soft-UI flourish; an instrument's panel is drawn or it is not. Two
animation classes with no remaining callers were removed with it.

**The fixture banner is a stamp line.** Mono, with the accent on the label and
the rule beneath instead of a tinted fill — a fill would have been the one thing
on the page coloured without meaning something.

**Known tension, left standing.** Links are cyan, and cyan is also the DERIVED
hue. The underline disambiguates a link from a reading, and recolouring every
link on the estate is a larger change than this pass; it is noted here rather
than silently accepted.

## Where it is applied

- The shell: ruled section labels in the inspector and the navigation rail, mono
  spaced table headers, registration ticks on the top bar, the grid on the
  working surface. Applied in CSS against classes the markup already carried, so
  the estate inherited the language without every page being rewritten and
  without the navigation, table and inspector tests changing what they assert.
- The whole Earth Twin inspector, in a density pass recorded in
  [Earth Twin](EARTH_TWIN.md): readings as ruled label-and-value lines, provenance
  as keyed stamps, explanations behind disclosures. `Readout` grew to accept
  structured values without loosening its UNKNOWN guard — a string or a node
  with no declared state takes no hue, because a default colour on content of
  unknown kind would be a claim nobody made.
- Located events on `/earth`: a marker's colour is the claim's current reading
  against the corpus in the check vocabulary's own tokens, a conflict is drawn
  loud, a ledger event takes the withdrawn hue, and the card is a drawn panel
  whose frame is DECLARED for a claim and WITHDRAWN for a retraction.
- The operator instrument on `/earth`: each layer as a drawn panel with a ruled
  readout, the void list under an `UNKNOWN` rule, and the release, seat and
  knowledge time stamped into the frame.
- The compression standing on `/model`: a segmented meter, three of five lit,
  beside the admitted-record readout that reads `UNKNOWN` from a process with no
  store. The meter is `DERIVED` and not `UNKNOWN` — how many steps collapse is
  computed from held records and is a real number; what is unreadable is the
  count beside it. Painting the whole meter as unknown would overstate the
  uncertainty, which is the same failure as understating it.

## Verification (2026-09-08)

Typecheck; ESLint at `--max-warnings=0`; 4,692 unit tests across 190 files, 20
of them new for the scale and the primitives, including the structural test that
the stylesheet declares a token for exactly the states the module declares and
no others; `next build`; 178 Playwright tests (88 desktop, 90 Pixel 7),
including ten axe passes over the restyled surfaces with no serious or critical
violations. Run on the tree merged with the parallel session's README and
architecture-test change, not before it.
