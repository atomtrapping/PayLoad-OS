/**
 * A run of distinct objects, drawn as a chain.
 *
 * Both specifications this repository now carries turn on the same move: a
 * sequence of things that look like one thing and are not. A legal entity, an
 * operating organization, a facility, a parcel, an access point, a network
 * connection. A published source, an interpreted requirement, a reviewed
 * executable rule, an assessment under it. Reference, assessed, monitored.
 *
 * Prose can state that they are distinct. A figure makes the distinctness the
 * thing you see first — each object in its own frame, numbered, with the arrow
 * between them carrying no meaning beyond order. That is the whole encoding:
 * position is sequence, and nothing else is drawn, because nothing else is
 * known. A chain does not say that the objects are stages of a workflow, that
 * one causes another, or that the last is the goal.
 *
 * It is an ordered list, so a reader who cannot see it is told the order by
 * the markup rather than by a glyph. The arrow is `aria-hidden` for the same
 * reason: it is a picture of the ordering the list already carries, and a
 * screen reader announcing "right arrow" five times would be reading the
 * decoration instead of the content.
 */
export function ChainFigure({ objects, label, emphasise }: {
  objects: readonly string[];
  /** Names the chain for a reader who cannot see the grouping. */
  label: string;
  /** One object to mark, when a surface is showing where something sits in the chain. */
  emphasise?: string;
}) {
  return (
    <ol className="chain" aria-label={label} data-testid="chain">
      {objects.map((object, index) => (
        <li key={object} className="chain-node" data-chain-node={object} data-here={object === emphasise ? 'true' : undefined}>
          <span className="chain-step" aria-hidden="true">{index + 1}</span>
          <span className="chain-name">{object}</span>
          {index < objects.length - 1 && <span className="chain-arrow" aria-hidden="true">→</span>}
        </li>
      ))}
    </ol>
  );
}
