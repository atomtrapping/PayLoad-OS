/**
 * The operating model, in five chapters.
 *
 * One document of 26 sections shipped 621 KB of HTML and 2,588 nodes to
 * every reader, most of whom came for one chapter. Each chapter is now its
 * own route over the same section components; this registry is what the
 * contents figure, the routes and the rail read, and chapters.test.ts
 * holds it to the sections the chapter components actually render.
 */
export type ModelChapter = { slug: string; href: string; title: string; summary: string; sections: readonly { id: string; title: string }[] };

export const MODEL_CHAPTERS: readonly ModelChapter[] = [
  { slug: 'firm', href: '/model', title: 'The firm, its products and its doctrine', summary: 'What the firm is, what it makes, how it distributes it, whom it serves, the seven rules, and what of all that exists in this repository.', sections: [
    { id: 'pm-material', title: 'Source material' },
    { id: 'pm-production', title: 'The production system' },
    { id: 'pm-fabrics', title: 'The five fabrics' },
    { id: 'pm-distribution', title: 'Inventory and distribution' },
    { id: 'pm-customers', title: 'Customer categories' },
    { id: 'pm-economics', title: 'Economic architecture' },
    { id: 'pm-architecture', title: 'Product architecture' },
    { id: 'pm-states', title: 'Three states of information' },
    { id: 'pm-doctrine', title: 'Doctrine' },
    { id: 'pm-presence', title: 'What exists in this repository' },
    { id: 'pm-coordination', title: 'Shared OS coordination' },
  ] },
  { slug: 'substrate', href: '/model/substrate', title: 'Identity, space, storage and projection', summary: 'What every line shares beneath its own identifiers: one identity core, the jobs space has beyond display, where each class of information would be kept, and the instruments that project one corpus without changing it.', sections: [
    { id: 'pm-identity', title: 'Identity: one core, three families, one join' },
    { id: 'pm-spatial', title: 'Space: the display was the easy half' },
    { id: 'pm-storage', title: 'Where the corpus is stored' },
    { id: 'pm-projection', title: 'Projection fabric' },
  ] },
  { slug: 'estimation', href: '/model/estimation', title: 'Estimation, scoring, the vessel and the carrier', summary: 'One joint over the evidence and what may not decide identity; credence by what a record survives; the vessel as the state and the port as a set; and the computation carrier as a punch card, not a proof.', sections: [
    { id: 'pm-estimation', title: 'Estimation: one joint, its constraints, and what may not decide identity' },
    { id: 'pm-scoring', title: 'Scoring by what a record survives, and the channel that cannot score' },
    { id: 'pm-maritime', title: 'Caravan: the vessel is the state, the port is a set' },
    { id: 'pm-carrier', title: 'The carrier: a punch card, not a proof' },
  ] },
  { slug: 'obligations', href: '/model/obligations', title: 'Obligations, custody, compression and the kinds of no', summary: "Where the doctrine is already someone else's duty; conditional custody worked through a correction that fired after release; what compresses and what must not; and every kind of no, kept apart.", sections: [
    { id: 'pm-actuarial', title: "Where the doctrine is already someone's obligation" },
    { id: 'pm-custody', title: 'Conditional custody: the documentary credit, with receipts for documents' },
    { id: 'pm-compression', title: 'What compresses, and what must not' },
    { id: 'pm-negative', title: 'The kinds of no, kept apart' },
  ] },
  { slug: 'standing', href: '/model/standing', title: 'What the additions cost, what is verified, and what it is worth', summary: 'Every capability with what it waits on, the pressure the additions put on what already existed, the verification tiers this repository reaches, and the value proposition kept concrete.', sections: [
    { id: 'pm-accommodation', title: 'What the additions cost, and what one acquisition would move' },
    { id: 'pm-verification', title: 'Verification tiers' },
    { id: 'pm-value', title: 'The value proposition, kept concrete' },
  ] },
];

export const chapterBySlug = (slug: string): ModelChapter | undefined => MODEL_CHAPTERS.find((chapter) => chapter.slug === slug);
export const CHAPTER_ROUTE_PATTERN = /^\/model(\/[a-z-]+)?$/;
