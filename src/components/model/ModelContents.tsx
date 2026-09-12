import Link from 'next/link';
import { MODEL_CHAPTERS } from './chapters';

/**
 * The contents of the operating model: five chapters, the current one open
 * to its sections, and the two beside it reachable from the foot of the
 * page. Drawn from the registry, so a sixth chapter appears here without a
 * line of drawing code.
 */
export function ModelContents({ current }: { current: string }) {
  return (
    <nav aria-label="Operating model chapters" className="surface p-3 flex flex-col gap-2" data-testid="model-contents">
      <span className="label-sm">Contents · five chapters</span>
      <ol className="m-0 p-0 list-none grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {MODEL_CHAPTERS.map((chapter, index) => {
          const here = chapter.slug === current;
          return (
            <li key={chapter.slug} className="surface-inset p-2 text-[12px] flex flex-col gap-1" data-chapter={chapter.slug} data-here={here}>
              <Link href={chapter.href} aria-current={here ? 'page' : undefined} className="font-medium inline-flex min-h-6 items-start" style={{ color: here ? 'var(--ice)' : 'var(--text-heading)' }}>
                <span className="mono" style={{ color: 'var(--text-muted)' }}>{String(index + 1).padStart(2, '0')}</span> {chapter.title}
              </Link>
              {here ? (
                <ul className="m-0 p-0 list-none flex flex-col" aria-label={`Sections of ${chapter.title}`}>
                  {/* Every link is at least 24px tall: the WCAG 2.2 target-size rule, which the audits enforce, wants a touch target that size or clear space around it. */}
                  {chapter.sections.map((section) => (
                    <li key={section.id} className="flex"><Link href={`${chapter.href}#${section.id}`} className="text-[11.5px] inline-flex min-h-6 items-center" style={{ color: 'var(--text-secondary)' }}>{section.title}</Link></li>
                  ))}
                </ul>
              ) : (
                <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{chapter.sections.length} sections</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The chapter before and the chapter after, at the foot of each chapter. */
export function ChapterSteps({ current }: { current: string }) {
  const index = MODEL_CHAPTERS.findIndex((chapter) => chapter.slug === current);
  const previous = index > 0 ? MODEL_CHAPTERS[index - 1] : null;
  const next = index >= 0 && index < MODEL_CHAPTERS.length - 1 ? MODEL_CHAPTERS[index + 1] : null;
  return (
    <nav aria-label="Neighbouring chapters" className="flex flex-wrap justify-between gap-2 text-[12.5px]" data-testid="chapter-steps">
      <span>{previous ? <Link href={previous.href} style={{ color: 'var(--info)' }}>← {previous.title}</Link> : null}</span>
      <span>{next ? <Link href={next.href} style={{ color: 'var(--info)' }}>{next.title} →</Link> : null}</span>
    </nav>
  );
}
