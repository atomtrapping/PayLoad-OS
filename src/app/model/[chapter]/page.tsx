import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { THESIS } from '@/domain/product';
import { MODEL_CHAPTERS, chapterBySlug } from '@/components/model/chapters';
import { ChapterSteps, ModelContents } from '@/components/model/ModelContents';
import { SubstrateChapter } from '@/components/model/SubstrateChapter';
import { EstimationChapter } from '@/components/model/EstimationChapter';
import { ObligationsChapter } from '@/components/model/ObligationsChapter';
import { StandingChapter } from '@/components/model/StandingChapter';

/**
 * Chapters two to five of the operating model, one route each over the same
 * section components the whole document was made of. Chapter one is /model.
 * The slugs are the registry's; anything else is not a page.
 */
const BODIES: Record<string, () => ReactNode> = {
  substrate: () => <SubstrateChapter />,
  estimation: () => <EstimationChapter />,
  obligations: () => <ObligationsChapter />,
  standing: () => <StandingChapter />,
};

export const dynamicParams = false;

export function generateStaticParams() {
  return MODEL_CHAPTERS.filter((chapter) => chapter.slug in BODIES).map((chapter) => ({ chapter: chapter.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ chapter: string }> }): Promise<Metadata> {
  const { chapter } = await params;
  const found = chapterBySlug(chapter);
  return { title: found ? `Operating model · ${found.title}` : 'Operating model' };
}

export default async function ModelChapterPage({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params;
  const found = chapterBySlug(chapter);
  const body = found && BODIES[found.slug];
  if (!found || !body) notFound();
  const number = MODEL_CHAPTERS.findIndex((entry) => entry.slug === found.slug) + 1;
  return (
    <div className="p-3 sm:p-5 max-w-[1000px] mx-auto w-full flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="label-sm">Notation Systems · operating model · chapter {number} of {MODEL_CHAPTERS.length}</span>
        <h1 className="m-0 text-[20px] font-semibold leading-snug" style={{ color: 'var(--text-heading)' }}>{found.title}</h1>
        <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>{found.summary}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{THESIS.firm}</p>
      </header>
      <ModelContents current={found.slug} />
      {body()}
      <ChapterSteps current={found.slug} />
    </div>
  );
}
