import type { Metadata } from 'next';
import { THESIS } from '@/domain/product';
import { FirmChapter } from '@/components/model/FirmChapter';
import { ChapterSteps, ModelContents } from '@/components/model/ModelContents';

export const metadata: Metadata = { title: 'Operating model' };

/**
 * The operating model, chapter one: what the firm is, what it makes, how it
 * distributes it, whom it serves, and what exists here. The three APIs are
 * the products; this terminal is not one. The text is the founder's; the
 * presence flags are facts about this repository. The other four chapters
 * are routes beneath this one, listed in the contents.
 */
export default function ProductPage() {
  return (
    <div className="p-3 sm:p-5 max-w-[1000px] mx-auto w-full flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="label-sm">Notation Systems · operating model</span>
        <h1 className="m-0 text-[20px] font-semibold leading-snug" style={{ color: 'var(--text-heading)' }}>{THESIS.firm}</h1>
        <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>{THESIS.production}</p>
        <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>{THESIS.inventory}</p>
      </header>
      <ModelContents current="firm" />
      <FirmChapter />
      <ChapterSteps current="firm" />
    </div>
  );
}
