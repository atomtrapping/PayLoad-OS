import { getCorpusSource, type CorpusSource } from './corpusSource';
import { buildProductWorkspace, ProductWorkspaceError, workspaceParam, type ProductDeskDomain, type WorkspaceParams } from '@/domain/productWorkspace';

export async function loadProductWorkspace(domain: ProductDeskDomain, params: WorkspaceParams, source: CorpusSource = getCorpusSource()) {
  const releaseId = workspaceParam(params, 'release');
  const corpusId = workspaceParam(params, 'corpus');
  const corpus = releaseId
    ? (await source.getRelease(releaseId))?.corpus
    : corpusId ? await source.getCorpus(corpusId) : (await source.listCorpora()).filter((c) => c.domain === domain).sort((a, b) => a.corpusId.localeCompare(b.corpusId))[0];
  if (!corpus || corpus.domain !== domain || (corpusId && corpus.corpusId !== corpusId)) throw new ProductWorkspaceError('CORPUS_NOT_AVAILABLE');
  return buildProductWorkspace(corpus, domain, params);
}
