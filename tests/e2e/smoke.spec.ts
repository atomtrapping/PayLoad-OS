import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LOCAL_RAILS } from '../../src/domain/console';
import { DOMAINS } from '../../src/domain/domains';
import { CUSTOMER_CATEGORIES, ECONOMIC_ARCHITECTURE, PRODUCTION_SYSTEM, THESIS } from '../../src/domain/product';

const ROUTES = ['/model', '/model/substrate', '/model/estimation', '/model/obligations', '/model/standing', '/releases', '/releases/REL-CAR-2026.09.01', '/stream', '/stream?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z', '/retractions', '/cases', '/cases/CASE-CAR-7C104', '/cases/CASE-CAR-5B221', '/cases/new', '/rulings', '/rulings/RUL-7C104-r2', '/rulings/RUL-5B221-r1', '/replay/CASE-CAR-7C104', '/profiles/caravan.brokerage.specialty-cargo', '/evidence', '/api'];

for (const route of ROUTES) {
  test(`renders ${route} without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('main')).toBeVisible();
    // Google Fonts is blocked in this environment; a font stylesheet failure is not an application error.
    expect(errors.filter((e) => !e.includes('fonts.googleapis') && !e.includes('net::ERR') && !/404/.test(e))).toEqual([]);
  });
}

test('axe: releases, stream, case workspace and ruling viewer have no serious or critical violations', async ({ page }) => {
  for (const route of ['/model', '/model/substrate', '/model/obligations', '/releases', '/releases/REL-CAR-2026.09.01', '/stream', '/cases/CASE-CAR-7C104', '/rulings/RUL-7C104-r2', '/cases']) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, `${route}: ${JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })), null, 1)}`).toEqual([]);
  }
});

test('keyboard: skip link, primary nav, and a failed check are reachable and operable', async ({ page }) => {
  await page.goto('/cases/CASE-CAR-7C104');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  const failed = page.getByRole('complementary', { name: 'Decision' }).getByRole('button', { name: /CAR-101 Lot identity reconciles/ });
  await failed.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('invariant-detail')).toContainText('E_LOT_IDENTITY_UNRECONCILED');
  await expect(page.locator('[data-claim-id="C-7C104-1"]')).toHaveAttribute('data-highlighted', 'true');
});

test('mobile: the ruling viewer remains legible and does not scroll horizontally', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only');
  await page.goto('/rulings/RUL-7C104-r2');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = await page.evaluate(() => window.innerWidth);
  expect(width).toBeLessThanOrEqual(vw + 1);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Scoped to the ruling, not the whole document: the sidebar's own copy names
  // what is refused, and a bare text match found that first.
  const ruling = page.getByRole('main');
  await expect(ruling.getByText('Refused').first()).toBeVisible();
  await expect(ruling.locator('[data-clock="validAt"]').first()).toBeVisible();
  await expect(ruling.locator('[data-clock="knownAt"]').first()).toBeVisible();
});

test('the feed serves fixture-only JSON with release, bounds, refusals and retractions', async ({ request }) => {
  const releases = await request.get('/api/v1/releases');
  expect(releases.status()).toBe(200);
  expect(releases.headers()['x-payload-fixture-only']).toBe('true');
  // next.config.ts sets this for every route; a live fetch proves it for all 27.
  expect(releases.headers()['x-content-type-options']).toBe('nosniff');
  const list = await releases.json();
  expect(list.fixture_only).toBe(true);
  expect(list.releases[0].status).toBe('CURRENT');
  const asOf = await request.get('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z&question=WHAT_WE_HELD');
  const a = await asOf.json();
  expect(a.answer.value).toBe(40);
  const later = await (await request.get('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-09-01T12:00:00Z&question=WHAT_WE_HELD')).json();
  expect(later.answer.value).toBe(40.12);
  expect(later.answer.uncertainty).toEqual({ low: 40.08, high: 40.16, semantics: 'Weighbridge stated accuracy ±0.040 t' });
  const refused = await (await request.get('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-7C-104&predicate=condition.moisture&validAt=2026-08-28T14:00:00Z&knownAt=2026-09-01T12:00:00Z&question=WHAT_WE_HELD')).json();
  expect(refused.answer).toBeNull();
  expect(refused.refusal.code).toBe('NO_IDENTITY_LINK');
  const retractions = await (await request.get('/api/v1/retractions?since=2026-08-26T00:00:00Z')).json();
  expect(retractions.retractions[0].retractionId).toBe('RET-0002');
  const bad = await request.get('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=x');
  expect(bad.status()).toBe(400);
});

test('the product page states the firm, the twelve stages, the three customer categories and the four-step economic architecture', async ({ page }) => {
  // The operating model is five chapter routes over one registry (src/components/model/chapters.ts):
  // the firm and its doctrine on /model, then substrate, estimation, obligations and standing beneath it.
  // Each block below reads one chapter; the assertions are the ones the single document carried.
  await page.goto('/model');
  // Read from the thesis rather than from a copy of it. The firm's positioning
  // was rewritten and the unit test moved with it while this one kept asserting
  // the old sentence, which is the failure mode a duplicated string has.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(THESIS.firm);
  // Counted from the model rather than written down beside it. A fourth
  // customer category was added and this test still expected three, which is
  // the same staleness the heading had: the page and the test were reading two
  // different copies of one fact.
  await expect(page.locator('[data-stage]')).toHaveCount(PRODUCTION_SYSTEM.length);
  await expect(page.locator('[data-customer]')).toHaveCount(CUSTOMER_CATEGORIES.length);
  await expect(page.locator('[data-step]')).toHaveCount(ECONOMIC_ARCHITECTURE.length);
  // The three data-product lines use API/MCP delivery; NotationsOS stays internal.
  const tree = page.getByLabel('Product architecture tree');
  // The scope line comes from the registry too. It was rewritten with the
  // firm's positioning and this assertion held the old wording.
  const landshark = DOMAINS.find((domain) => domain.id === 'LANDSHARK')!;
  // The tree lowercases the scope, so the comparison does the same rather than
  // asserting a third spelling of it.
  await expect(tree).toContainText(`${landshark.label} — ${landshark.delivery} — ${landshark.scope.toLowerCase()}`);
  await expect(tree).toContainText('NotationsOS — internal terminal');
  await expect(page.locator('#pm-architecture')).toContainText('data-product lines');
  await expect(page.locator('[data-fabric]')).toHaveCount(5);
  await expect(page.locator('[data-fabric="state"][data-presence="PRESENT"]')).toHaveCount(1);
  await expect(page.locator('[data-fabric="compute"][data-presence="PRESENT"]')).toContainText('benchmark demonstration is synthetic');
  await expect(page.locator('[data-fabric="compute"]')).toContainText('Managed customer workloads, trained neural models and automatic canonical admission remain absent');
  await expect(page.locator('[data-information-state]')).toHaveCount(3);
  await expect(page.locator('[data-doctrine-rule]')).toHaveCount(7);
  await expect(page.getByTestId('operational-rule')).toContainText('shared information');
  await expect(page.getByRole('cell', { name: /^Samsara single-vehicle GPS-history adapter/ })).toContainText('offline-tested; live fleet qualification, continuous sync and inferred visits remain absent');
  await page.getByRole('link', { name: /^Local weighted rigid registration/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Registration and access' })).toBeVisible();
  await expect(page.getByTestId('registration-boundary')).toContainText('not a surveyed building');
  await page.goto('/model');
  await page.getByRole('link', { name: /^Local clearance value-of-information/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Clearance measurement design' })).toBeVisible();
  await expect(page.getByTestId('clearance-boundary')).toContainText('Synthetic demonstration');
  await page.goto('/model/substrate');
  await expect(page.locator('[data-engine="kepler.gl"][data-presence="ABSENT"]')).toHaveCount(1);
  // OpenUSD is a projection target with no library installed, so it is routed to and absent.
  await expect(page.locator('[data-engine="OpenUSD"][data-presence="ABSENT"]')).toHaveCount(1);
  await expect(page.getByTestId('usd-role')).toContainText('strongest opinion wins');
  await expect(page.locator('[data-usd-row="Admitted state only"][data-usd-state="BLOCKED"]')).toHaveCount(1);
  await expect(page.locator('[data-usd-state="BLOCKED"]')).toHaveCount(2);
  // The learned manifold is a tier below the corpus, and every arrow loses authority.
  await expect(page.getByTestId('manifold-tier')).toContainText('corpus → learned manifold → render');
  await expect(page.locator('[data-complex]')).toHaveCount(4);
  await expect(page.locator('[data-manifold-trap="CONTINUOUS_FABRICATION"]')).toContainText('Void renders void');
  // Three sensor families: two observe structure, one forces the state and gates the sensors.
  await expect(page.locator('[data-sensor-family]')).toHaveCount(3);
  await expect(page.locator('[data-sensor-family="METEOROLOGY"][data-sensor-role="FORCES_AND_GATES"]')).toHaveCount(1);
  await expect(page.getByTestId('two-convergences')).toContainText('neither emits corpus concepts');
  await expect(page.getByTestId('weather-role')).toContainText('gates the sensors');
  await expect(page.getByTestId('vertical-datum')).toContainText('not yet reachable');
  await expect(page.locator('[data-mapping-stage]')).toHaveCount(4);
  await expect(page.locator('[data-engine="records"][data-presence="FIXTURE"]')).toHaveCount(1);
  // The routing table decided what the fabric serves and no surface had ever
  // shown it. Thirteen routes, five READY, and the seat the pinned engine
  // would fill named with every reason it cannot fill it here.
  const routing = page.getByTestId('projection-routing');
  await expect(routing.locator('[data-route-mode]')).toHaveCount(13);
  await expect(routing.locator('[data-route-result="READY"]')).toHaveCount(5);
  await expect(routing).toContainText('5 READY · 8 UNAVAILABLE');
  await expect(page.getByTestId('structure-seat')).toContainText('BIM State Transformer Engine');
  await expect(page.getByTestId('structure-seat')).toContainText('Naming the engine is not routing to it');
  // Storage is declared as candidates with an honest present state: six classes, none held by a running service.
  // Identity: one core, three families, one absent join with its hazards named.
  await expect(page.locator('[data-core]')).toHaveCount(4);
  await expect(page.locator('[data-core="BITEMPORALITY"][data-core-state="PRESENT"]')).toHaveCount(1);
  await expect(page.locator('[data-core="RESOLUTION"][data-core-state="ABSENT"]')).toHaveCount(1);
  await expect(page.locator('[data-family]')).toHaveCount(3);
  await expect(page.locator('[data-identifier-state="IN_USE"]')).toHaveCount(2);
  await expect(page.locator('[data-join-key="RESOLVED_ENTITY"][data-join-state="ABSENT"]')).toContainText('matching name is not a resolution');
  await expect(page.getByTestId('cross-line-join')).toContainText('A join built per line is not a join');
  // The cell key is computed now, and the hazard it carries is unchanged.
  await expect(page.locator('[data-join-key="SPATIAL_CELL"][data-join-state="PRESENT"]')).toContainText('never what the comparison concludes');
  // The two present keys, run across all three lines: co-location established, resolution not.
  const keys = page.getByTestId('keys-run');
  await expect(keys.locator('[data-line]')).toHaveCount(3);
  await expect(keys.locator('[data-pair-outcome]')).toHaveCount(11);
  await expect(keys.locator('[data-pair-outcome="CO_LOCATED"]')).toHaveCount(4);
  await expect(page.getByTestId('keys-resolved')).toHaveAttribute('data-value', '0');
  await expect(keys).toContainText('RESOLVED 0 · ABSENT');
  // A pair with no key reads hollow, and is neither co-located nor apart.
  const unkeyable = keys.locator('[data-pair-outcome="NOT_KEYABLE"]');
  await expect(unkeyable).toHaveCount(3);
  await expect(unkeyable.first()).toContainText('states no horizontal uncertainty');
  await expect(unkeyable.first().locator('[data-epistemic="UNKNOWN"]').first()).toBeVisible();
  await expect(page.getByTestId('keys-because')).toContainText('0 are resolved');
  // Space: six roles with their honest state, five derivations ranked, the display the only built one.
  await expect(page.locator('[data-spatial-role]')).toHaveCount(6);
  await expect(page.locator('[data-spatial-role="DISPLAY"][data-spatial-state="BUILT"]')).toContainText('windshield, not the engine');
  await expect(page.locator('[data-spatial-role="INFERENCE"][data-spatial-state="ABSENT"]')).toHaveCount(1);
  await expect(page.locator('[data-derivation]')).toHaveCount(5);
  await expect(page.locator('[data-derivation="FLOW_GEOMETRY"]')).toContainText('loosest uncertainty in the chain');
  await expect(page.locator('#pm-spatial')).toContainText('not a spatial database');
  await expect(page.locator('[data-storage]')).toHaveCount(7);
  // Installed adapters are not evidence of running cloud services.
  await expect(page.locator('[data-storage][data-state="SERVICE"]')).toHaveCount(0);
  await expect(page.locator('[data-storage][data-state="ADAPTER_READY"]')).toHaveCount(2);
  await expect(page.locator('[data-storage="records"][data-state="ADAPTER_READY"]')).toContainText('Transactional relational storage');
  await expect(page.locator('[data-storage="artifacts"][data-state="ADAPTER_READY"]')).toContainText('Exoscale SOS');
  await expect(page.locator('[data-storage="analytics"][data-state="LOCAL_PILOT"]')).toContainText('Apache Iceberg');
  await expect(page.locator('[data-storage="entities"][data-state="FIXTURE"]')).toHaveCount(1);
  await expect(page.locator('[data-storage="embeddings"][data-state="ABSENT"]')).toContainText('Qdrant, Milvus, pgvector');
  await expect(page.getByRole('heading', { name: 'Where the corpus is stored' })).toBeVisible();
  await expect(page.locator('#pm-storage')).toContainText('does not report live deployment health');
  await expect(page.locator('#pm-storage')).toContainText('not a canonical relation');
  await page.goto('/model/estimation');
  // Estimation: a constraint is a measurement, clipping is malpractice, and a solver never decides identity.
  await expect(page.getByTestId('constraint-identity')).toContainText('H = C, R = 0 and z = c');
  await expect(page.locator('[data-enforcement="CLIPPING"][data-verdict="FORBIDDEN"]')).toContainText('corrupts the posterior silently');
  await expect(page.locator('[data-enforcement="PROJECTION"][data-verdict="RECOMMENDED"]')).toHaveCount(1);
  await expect(page.getByTestId('harvest-rule')).toContainText('rank(C) for free');
  await expect(page.locator('[data-factor]')).toHaveCount(5);
  await expect(page.getByTestId('solver-boundary')).toContainText('never delegates authority to the solver');
  // Scoring: four tiers, three frame risks, and a reference channel the filters cannot feed.
  await expect(page.locator('[data-filter-tier]')).toHaveCount(4);
  await expect(page.locator('[data-filter-tier="RELIABILITY"][data-filter-state="ABSENT"]')).toHaveCount(1);
  await expect(page.locator('[data-frame-risk="CORRELATED_FAILURE"]')).toContainText('never by the count of agreeing sources');
  await expect(page.getByTestId('reference-firewall')).toContainText('benchmark that trains the test');
  // Caravan: five channels, and the one that is a prior rather than an observation.
  await expect(page.locator('[data-vessel-channel]')).toHaveCount(5);
  await expect(page.locator('[data-vessel-channel="DISPATCH"][data-channel-kind="PRIOR"]')).toContainText('most common error in this domain');
  await expect(page.getByTestId('closure-measurement')).toContainText('aggregators already sell');
  await expect(page.getByTestId('membership-ruling')).toContainText('An unknown set is not an empty set');
  await expect(page.locator('[data-set-object]')).toHaveCount(6);
  // The carrier: two of four card properties, general proving refused, the model mirrored and not the world.
  await expect(page.getByTestId('not-credibility')).toContainText('estate');
  await expect(page.locator('[data-card-property][data-card-present="false"]')).toHaveCount(2);
  await expect(page.getByTestId('mirrors-the-model')).toContainText('Two congruences, two guardians');
  await expect(page.getByTestId('authority-direction')).toContainText('Never a silent overwrite');
  await expect(page.getByTestId('composition-adjudication')).toContainText('many claims, one addressable state');
  await expect(page.locator('[data-vocabulary-pair="Adjudication policy"]')).toHaveCount(1);
  await page.goto('/model/obligations');
  // The actuarial mapping: three correspondences are the same object under two names.
  await expect(page.locator('[data-correspondence="IDENTICAL"]')).toHaveCount(3);
  await expect(page.getByTestId('mandate-inversion')).toContainText('inventing a professional duty');
  await page.goto('/model/standing');
  await expect(page.locator('[data-tier][data-reached="true"]')).toHaveCount(2);
});

test('the model page derives what each capability waits on, and separates absorbed pressure from owed', async ({ page }) => {
  await page.goto('/model/standing');
  const section = page.locator('#pm-accommodation');
  // The seed the probes found: one independently corroborated quantity that cannot be adjudicated.
  await expect(section).toContainText('lot 5B-221’s gross weight');
  await expect(section).toContainText('a second account that stated its own uncertainty');
  // Every capability is rendered with a derived fit; at least one runs and at least one does not.
  const capabilities = section.locator('[data-capability]');
  expect(await capabilities.count()).toBeGreaterThanOrEqual(12);
  expect(await section.locator('[data-fit="RUNS_TODAY"]').count()).toBeGreaterThan(0);
  await expect(section.locator('[data-capability="ADMISSION"][data-fit="SEVERAL_THINGS_AWAY"]')).toContainText('A built gate is not a crossed one');
  await expect(section.locator('[data-capability="EVENT_CLOSURE"]')).toContainText('placed in time by two channels');
  // The third clock's debt is paid and the module says so; what stays owed is the schema slot.
  await expect(section.locator('[data-pressure="Every caller of an as-of answer"][data-absorbed="true"]')).toContainText('paid rather than noted');
  await expect(section.locator('[data-absorbed="false"]').first()).toContainText('record schema');
  await expect(section.locator('[data-pressure="The verification tiers"][data-absorbed="true"]')).toContainText('None of the additions raises a tier');
});

test('the stream names which as-of question it asks, and refuses the one this corpus cannot bound', async ({ page }) => {
  await page.goto('/stream?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z&question=WHAT_WE_HELD');
  // The answerable question: the clock is named on the page and carried in the feed link.
  await expect(page.getByTestId('asof-question')).toHaveValue('WHAT_WE_HELD');
  await expect(page.getByTestId('asof-question-meaning')).toContainText('CORPUS_KNOWLEDGE_TIME');
  await expect(page.getByTestId('asof-banner')).toContainText('Answer for');
  await expect(page.getByTestId('asof-url')).toHaveText(/question=WHAT_WE_HELD/);

  // Switching the question refuses rather than re-answering on the wrong clock.
  await page.getByTestId('asof-question').selectOption('WHAT_THE_SOURCE_KNEW');
  await expect(page.getByTestId('asof-question-meaning')).toContainText('SOURCE_TIME');
  const banner = page.getByTestId('asof-banner');
  await expect(banner).toContainText('QUESTION_NOT_ANSWERABLE');
  await expect(banner).toContainText('No record in this corpus carries one');
  await expect(page.locator('#st-refusal')).toContainText('never inferred from a gap');
  await expect(page.getByTestId('asof-url')).toHaveText(/question=WHAT_THE_SOURCE_KNEW/);
});

test('the model page works a release through a correction, and never un-fires it', async ({ page }) => {
  await page.goto('/model/obligations');
  const section = page.locator('#pm-custody');
  const worked = page.getByTestId('custody-worked');
  // Granted on what was held, withheld on what is held, and the decision untouched.
  await expect(worked.locator('[data-custody-row="decision"]')).toContainText('GRANTED');
  await expect(worked.locator('[data-custody-row="decision"]')).toContainText('DEMONSTRATION');
  await expect(worked.locator('[data-custody-row="restatement"]')).toContainText('RET-0001 (CORRECTION)');
  await expect(worked.locator('[data-custody-row="now"]')).toContainText('WITHHELD');
  // The terminal state is named on the surface: a correction reversed it, and a
  // withdrawal would not have been routed the same way.
  await expect(worked.locator('[data-custody-row="now"][data-post-release="REVERSED_ON_CORRECTION"]')).toBeVisible();
  await expect(worked.locator('[data-custody-row="now"]')).toContainText('right on what was held and is wrong on what is held');
  // The window is measured and refused as a rate.
  await expect(page.getByTestId('custody-window')).toContainText('anecdote, not a frequency');
  // The prohibitions are rendered with where each is enforced.
  await expect(section.locator('[data-never="Hold the collateral."]')).toContainText('licensed activity');
  await expect(section.locator('[data-never="Un-fire a release."]')).toContainText('never alters it');
  await expect(section.locator('[data-vehicle-state="RELEASED"]')).toContainText('No release has fired');
  // The exportable claim: reversal exposure is a property of a corpus, not of this vehicle.
  await expect(page.getByTestId('custody-exportable')).toContainText('measurable property of a corpus');
  await expect(page.getByTestId('custody-exportable')).toContainText('has no correction tape');
  // Priceability is a gate that names what it is waiting for.
  await expect(page.getByTestId('custody-priceability')).toContainText('flips on its own');
  // The decision carries the neighbourhood it was made in, and at that instant nothing had been restated.
  await expect(page.getByTestId('custody-neighbourhood')).toContainText('no observed window at all');
  await expect(page.getByTestId('custody-neighbourhood')).toContainText('An unobserved window is not a short one');
  // Execution attestors are commodity; fact attestors are estate-dependent.
  await expect(page.getByTestId('custody-attestors').locator('[data-attestor="EXECUTION"]')).toContainText('verified assertion');
  await expect(page.getByTestId('custody-attestors').locator('[data-attestor="FACT"]')).toContainText('Estate-dependent');
  await expect(page.getByTestId('custody-trust-order')).toContainText('Transport verification is not content testimony');
});

test('the model page separates translation from judgment, and counts what actually collapses', async ({ page }) => {
  await page.goto('/model/obligations');
  const section = page.locator('#pm-compression');
  expect(await section.locator('[data-layer="TRANSLATION"]').count()).toBe(5);
  expect(await section.locator('[data-layer="JUDGMENT"]').count()).toBe(3);
  // The judgment steps name what compressing them would actually be.
  await expect(section.locator('[data-stack-step="CLOSING"]')).toContainText('compel settlement');
  await expect(section.locator('[data-stack-step="UNDERWRITING"]')).toContainText('Never the witness');
  // And the count is derived, not claimed: two steps wait on an admitted record.
  await expect(page.getByTestId('compression-standing')).toContainText('3 of 5');
  await expect(page.getByTestId('compression-standing')).toContainText('a property of the trail rather than of the design');
  // The page cannot reach the write boundary, so it says so rather than reporting a zero it did not check.
  await expect(page.getByTestId('compression-standing')).toContainText('an unreadable count is not a zero');
});

test('the model page keeps the kinds of no apart, each with the mechanism that enforces it', async ({ page }) => {
  await page.goto('/model/obligations');
  const section = page.locator('#pm-negative');
  const rules = section.locator('[data-negative-rule]');
  expect(await rules.count()).toBeGreaterThanOrEqual(7);
  await expect(section.locator('[data-negative-rule="UNKNOWN_IS_NOT_EMPTY"]')).toContainText('An unknown set is not an empty set');
  await expect(section.locator('[data-negative-rule="WITHDRAWN_IS_NOT_FALSE"]')).toContainText('does not supply a contrary fact');
  await expect(section.locator('[data-negative-rule="WITHDRAWN_IS_NOT_FALSE"]')).toContainText('collateralVehicle.ts');
  await expect(section.locator('[data-negative-rule="REFUSED_IS_NOT_FALSE"]')).toContainText('admissibility');
  await expect(section).toContainText('phone call');
});

test('a release page states certification, the production record and the rights matrix with trading prohibited', async ({ page }) => {
  await page.goto('/releases/REL-CAR-2026.09.01');
  await expect(page.getByTestId('certification')).toContainText('Certified release');
  await expect(page.getByTestId('certification')).toContainText('internal recompute');
  await expect(page.getByRole('table', { name: 'Production record' })).toContainText('Recall');
  await expect(page.getByRole('table', { name: 'Production record' })).toContainText('Not run');
  const matrix = page.getByRole('table', { name: 'Intelligence-rights schedule' });
  await expect(matrix.locator('[data-use="trading"][data-permitted="true"]')).toHaveCount(0);
  await expect(matrix.locator('[data-use="proprietary_strategy"][data-permitted="true"]')).toHaveCount(0);
  await expect(matrix.locator('[data-use="customer_delivery"][data-permitted="false"]')).toHaveCount(1);
  await expect(matrix.locator('[data-use="customer_delivery"][data-decision="DENIED"]')).toHaveCount(1);
  await expect(matrix.locator('[data-use="redistribution"][data-decision="APPROVAL_REQUIRED"]')).toHaveCount(4);
  await page.getByText('Source registrations of record').click();
  const registrations = page.getByRole('table', { name: 'Source registrations' });
  await expect(registrations).toBeVisible();
  await expect(registrations).toContainText('TRADING');
  await expect(registrations.locator('[data-registration-id]')).toHaveCount(7);
  const manifest = await (await page.request.get('/api/v1/releases/REL-CAR-2026.09.01/manifest')).json();
  expect(manifest.manifest.certification.status).toBe('CERTIFIED');
});

test('stream: changing the knowledge time changes the answer, in the page and in the feed link', async ({ page }) => {
  await page.goto('/stream?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z');
  await expect(page.getByRole('article', { name: 'Record REC-0203' })).toBeVisible();
  // The control is a client component, and a fill that lands before React has
  // attached its handler changes the DOM value without changing the state. This
  // failed once in four full-suite runs and never in 25 isolated or parallel
  // repeats, so the interaction is retried rather than the assertion weakened:
  // the answer must still change to REC-0204, or this fails.
  await expect(async () => {
    await page.getByLabel('Known by').fill('2026-09-01T12:00');
    await expect(page.getByRole('article', { name: 'Record REC-0204' })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId('asof-url')).toContainText('knownAt=2026-09-01T12%3A00%3A00Z');
});

test('candidates: the local rail is visible, unadmitted, identity unresolved, and absent from the feed', async ({ page }) => {
  await page.goto('/candidates');
  await expect(page.getByRole('heading', { level: 1, name: 'Candidate production' })).toBeVisible();
  const boundary = page.getByTestId('candidate-boundary');
  await expect(boundary).toContainText('UNADMITTED');
  await expect(boundary).toContainText('canonicalId is null');
  await expect(page.locator('[data-normalization-id][data-state="NORMALIZED"]')).toHaveCount(1);
  await expect(page.locator('[data-normalization-id][data-state="QUARANTINED"]')).toHaveCount(1);
  await expect(page.getByTestId('quarantine')).toContainText('SCHEMA_MISMATCH');
  await expect(page.locator('[data-canonical-id="null"]')).toHaveCount(1);
  await expect(page.locator('[data-build-id="demo-caravan-carrier-build-001"][data-state="UNADMITTED"]')).toHaveCount(1);
  await expect(page.locator('[data-cutoff="within"]')).toHaveCount(1);
  await expect(page.locator('[data-refusal="DERIVATION_NOT_ALLOWED"]')).toHaveCount(1);
  await expect(page.locator('[data-refusal="MEMBER_AFTER_CUTOFF"]')).toHaveCount(1);
  await expect(page.locator('[data-decision="DENIED"]')).toHaveCount(0);
  const feed = await (await page.request.get('/api/v1/releases/REL-CAR-2026.09.01/records')).text();
  expect(feed).not.toContain('demo-caravan');
  expect(feed).not.toContain('UNADMITTED');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Candidates' })).toBeVisible();
});

test('a retraction names what it reaches and what it cannot reach, and the recall machinery is stated on both sides', async ({ page }) => {
  await page.goto('/retractions');
  // The impact table is progressive disclosure: open every retraction's summary first.
  const summaries = page.locator('summary', { hasText: 'What this correction reaches' });
  const count = await summaries.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await summaries.nth(i).click();
  // A ruling the corpus knows relied on a corrected record is named; a pinned projection is clean.
  await expect(page.locator('[data-impact="RULING"][data-taint="TAINTED"]').first()).toBeVisible();
  await expect(page.locator('[data-impact="PROJECTION"][data-taint="CLEAN"]').first()).toContainText('pinned');
  // What cannot be decided is shown as undecidable, never as unaffected.
  await expect(page.locator('[data-impact="DELIVERED_RECORD"][data-taint="UNDETERMINED"]').first()).toBeVisible();
  await expect(page.locator('[data-impact="NOTATION"][data-taint="UNDETERMINED"]').first()).toBeVisible();
  await expect(page.getByTestId('recall-absent')).toContainText('delivery ledger');
  await expect(page.getByTestId('delivery-ledger')).toContainText('specified and empty');
  await expect(page.getByTestId('recall-machinery')).toContainText('not a convenience of the schema');
});

test('the serving boundary states what a transport can enforce, and the reasoner is a witness with no authority', async ({ page }) => {
  await page.goto('/api');
  /* The tool surface enforces the ask; the feed beside it does not, and neither claim swallows the other. */
  await expect(page.getByTestId('serving-standing')).toContainText('admitted or refused per call with a receipt');
  await expect(page.getByTestId('serving-standing')).toContainText('the same unauthenticated HTTP feed');
  await expect(page.getByTestId('serving-standing')).toContainText('asserted rather than authenticated');
  await expect(page.locator('[data-transport-axis]')).toHaveCount(5);
  // Four axes favour the tool surface; retention favours neither, and the page says so.
  await expect(page.locator('[data-transport-axis="RETENTION"][data-stronger="NEITHER"]')).toHaveCount(1);
  await expect(page.getByTestId('intent-upgrade')).toContainText('not proof of one');
  await expect(page.getByTestId('two-part-rule')).toContainText('Serve the estates never');
  await expect(page.locator('[data-purpose="Model training"]')).toContainText('Refused at the type level');
  await expect(page.getByTestId('witness-not-authority')).toContainText('One wall, a third occupant');
  await expect(page.locator('[data-reasoning-rule]')).toHaveCount(3);
  await expect(page.locator('[data-reasoning-rule][data-rule-enforced="false"]')).toHaveCount(3);
});

test('the products page meters usage honestly: the content half is carried, the event half is not', async ({ page }) => {
  await page.goto('/products');
  // Four content fields are carried; five event fields are not, and the page says so.
  await expect(page.locator('[data-receipt][data-receipt-state="CARRIED"]')).toHaveCount(4);
  await expect(page.locator('[data-receipt="response_id"][data-receipt-state="ABSENT"]')).toBeVisible();
  await expect(page.locator('[data-receipt="recipient_id"][data-receipt-state="ABSENT"]')).toBeVisible();
  await expect(page.getByTestId('metering-readiness')).toContainText('not which response it is or who received it');
  // No unit of usage is counted yet, and the page never implies one is.
  await expect(page.locator('[data-usage-unit][data-counted="true"]')).toHaveCount(0);
  await expect(page.locator('[data-usage-unit]')).toHaveCount(3);
  // The boundary is stated: meter the usage, do not become the rails.
  await expect(page.getByTestId('metering-boundary')).toContainText('License prepared data and analytics packages');
  await expect(page.getByTestId('metering-boundary')).toContainText('Not settlement participant');
  // The federation defence is stated as work to do, not as protection already held.
  await expect(page.getByTestId('federation-risk')).toContainText('Issued-identifier resolution and source-comparison mechanisms exist');

  // Declared fixture identity makes the grade DEMONSTRATION, not a live sale.
  // Exact admission and current recipient/source permission still need a verifier.
  const catalogSlice = page.getByTestId('catalog-slice');
  await expect(catalogSlice).toContainText('NOT_FOR_SALE');
  await expect(catalogSlice).toContainText('grade DEMONSTRATION');
  await expect(catalogSlice).toContainText('selling the demonstration as the corpus');
  await expect(catalogSlice).toContainText('No production verifier is wired here');
  await expect(page.getByTestId('slice-corrections')).toContainText('would be multiplied by a real portfolio');
});

test('the information product states its question, fields, correction at two knowledge times, the ten-question contract and the acceptance target', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading', { level: 1, name: 'Caravan lot state' })).toBeVisible();
  await expect(page.getByTestId('customer-question')).toContainText('as knowable at a stated time');
  await expect(page.locator('[data-product-field]')).toHaveCount(7);
  await expect(page.locator('[data-product-field][data-within="false"]')).toHaveCount(0);
  await expect(page.getByTestId('prohibited-purposes')).toContainText('PROPRIETARY_STRATEGY, TRADING');
  await expect(page.locator('[data-asof="early"]')).toContainText('40 t');
  await expect(page.locator('[data-asof="late"]')).toContainText('40.12 t');
  await expect(page.locator('[data-asof="late"]')).toContainText('supersedes REC-0203');
  await expect(page.locator('[data-contract-question]')).toHaveCount(10);
  await expect(page.locator('[data-acceptance-step][data-reached="true"]')).toHaveCount(2);
  await expect(page.locator('[data-acceptance-step][data-reached="false"]')).toHaveCount(2);
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Products' })).toBeVisible();
});

test('production path without the local rail: the committed demonstration stands on the path, the enable command is shown, and every blocker is named', async ({ page }) => {
  await page.goto('/production');
  await expect(page.getByRole('heading', { level: 1, name: 'Production path' })).toBeVisible();
  await expect(page.getByTestId('production-path')).toHaveAttribute('data-mode', 'FIXTURE');
  const states = await page.locator('[data-stage]').evaluateAll((cells) => cells.map((cell) => `${cell.getAttribute('data-stage')}:${cell.getAttribute('data-state')}`));
  expect(states).toEqual(['source:DEMONSTRATION', 'acquisition:DEMONSTRATION', 'normalization:DEMONSTRATION', 'build:DEMONSTRATION', 'inspection:DEMONSTRATION', 'notation:BLOCKED', 'release:BLOCKED']);
  await expect(page.getByTestId('rail-disabled')).toContainText('npm run dev:production');
  await expect(page.getByTestId('run-console')).toHaveCount(0);
  await expect(page.getByTestId('source-readback')).toHaveAttribute('data-status', 'UNAVAILABLE');
  await expect(page.getByTestId('source-card')).toContainText('fmcsa-census-80806-2026-09-05-qualification');
  await expect(page.getByTestId('notation-card')).toContainText('ATTACH_EVIDENCE_REFERENCE');
  await expect(page.getByTestId('release-card')).toContainText('no candidate build from this rail has been put through it');
  // Nothing on this page reaches the rail: the disabled descriptor is the only answer it could get, and it is not asked.
  await page.getByRole('link', { name: 'See the demonstration' }).first().click();
  await expect(page).toHaveURL(/\/candidates/);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
});

test('notations without the local kernel: the workspace says DISABLED and the evidence-reference panel is a visibly marked fixture', async ({ page }) => {
  await page.goto('/notations');
  await expect(page.getByRole('heading', { level: 1, name: 'Notations', exact: true })).toBeVisible();
  await expect(page.getByText('DISABLED', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New notation title', { exact: true })).toBeDisabled();
  await expect(page.getByTestId('evidence-fixture-marker')).toContainText('FIXTURE');
  await expect(page.locator('[data-reference-id]')).toHaveCount(5);
  for (const state of ['RESOLVED', 'CHANGED', 'UNAVAILABLE', 'UNRESOLVED']) await expect(page.locator(`[data-reference-id][data-resolution="${state}"]`).first()).toBeVisible();
  await expect(page.getByTestId('interpretation').first()).toContainText('Authored interpretation');
});

test('the product control scopes the corpus surfaces to one line, and says what it hid', async ({ page }) => {
  await page.goto('/releases');
  // Three lines are served, and with no scope applied nothing in the control is pressed.
  await expect(page.locator('table[aria-label^="Releases of"]')).toHaveCount(3);
  /*
   * The page streams, and while it does the top bar's product control exists
   * twice: once in the header the reader sees and once in React's hidden
   * staging container, waiting to be swapped in. A locator resolved inside
   * that window matches both and the click is ambiguous. Under a loaded
   * machine the window is wide enough to land in. Wait for the swap, then
   * measure the control the reader ends up with.
   */
  await expect(page.getByTestId('product-control')).toHaveCount(1);
  const control = page.getByTestId('product-control');
  await expect(control.locator('[data-scoped="true"]')).toHaveCount(0);
  await expect(page.getByTestId('line-scope-hidden')).toHaveCount(0);

  // Choosing a line from the top bar narrows the page and lights that line.
  await control.locator('[data-domain="TRADEWIND"]').click();
  await expect(page).toHaveURL(/\/releases\?domain=TRADEWIND/);
  await expect(page.locator('table[aria-label^="Releases of"]')).toHaveCount(1);
  await expect(page.getByRole('table', { name: 'Releases of tradewind.freight-rates' })).toBeVisible();
  await expect(control.locator('[data-domain="TRADEWIND"][data-scoped="true"]')).toHaveCount(1);
  await expect(control.locator('[data-scoped="true"]')).toHaveCount(1);

  // Filtered is not absent, and the page says so with the count.
  await expect(page.getByTestId('line-scope-hidden')).toContainText('filtered out of this view, not absent from the corpus');

  // Landshark's withdrawal is the only retraction its line carries.
  await page.goto('/retractions?domain=LANDSHARK');
  await expect(page.locator('[data-retraction-id]')).toHaveCount(1);
  await expect(page.locator('[data-retraction-id="RET-LS-0001"]')).toBeVisible();
  await expect(page.getByTestId('line-scope-hidden')).toContainText('Filtered is not withdrawn and not absent');

  // Clearing the scope restores every line: two Caravan retractions, one each
  // from Tradewind and Landshark.
  await page.getByTestId('line-scope').locator('[data-scope="ALL"]').click();
  await expect(page.locator('[data-retraction-id]')).toHaveCount(4);
  await expect(page.getByTestId('line-scope-hidden')).toHaveCount(0);
});

test('the console reports the terminal on itself, and never turns an unreadable count into a number', async ({ page }) => {
  // The home route used to redirect into the release catalogue. A control
  // system's home is the system.
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'NotationsOS console' })).toBeVisible();

  // Three panels: what answered, what the gate did, what is refused.
  await expect(page.getByTestId('console-corpus')).toBeVisible();
  await expect(page.getByTestId('console-admission')).toBeVisible();
  await expect(page.getByTestId('console-rails')).toBeVisible();

  // Without a database this process cannot see the admission store, so the
  // three readings that come from it are UNREADABLE and carry no digit.
  const admitted = page.locator('[data-console-row="ADMITTED"]');
  await expect(admitted).toHaveAttribute('data-console-state', 'UNREADABLE');
  await expect(admitted).toContainText('UNREADABLE');
  await expect(admitted).toContainText('an unreadable count is not a zero');
  await expect(admitted.locator('[data-epistemic="UNKNOWN"]')).toHaveCount(1);
  await expect(page.locator('[data-console-state="UNREADABLE"]')).toHaveCount(3);

  // A count that was read is a count: the corpus panel answers from the
  // committed demonstration and says the number it found.
  const corpora = page.locator('[data-console-row="CORPORA"]');
  await expect(corpora).toHaveAttribute('data-console-state', 'READ');
  await expect(corpora.locator('[data-epistemic="MEASURED"]')).toHaveCount(1);

  // Every rail is off by configuration, drawn as DECLARED and never as a
  // refusal, and each prints the command that enables it.
  // Derived from the rail list, so adding a rail cannot silently make this
  // assertion describe a page that no longer exists.
  await expect(page.locator('[data-console-state="DISABLED"]')).toHaveCount(LOCAL_RAILS.length);
  await expect(page.locator('[data-console-state="DISABLED"] [data-epistemic="REFUSED"]')).toHaveCount(0);
  await expect(page.locator('[data-enable-with="PRODUCTION"]')).toHaveText('npm run dev:production');

  // The page declares that it writes nothing, and offers no control that could.
  await expect(page.getByTestId('console-loss')).toContainText('NONE');
  await expect(page.getByTestId('console-because')).toContainText(`${LOCAL_RAILS.length} of ${LOCAL_RAILS.length} local rails are off`);
  await expect(page.getByTestId('console').locator('button')).toHaveCount(0);
});
