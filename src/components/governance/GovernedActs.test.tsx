import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GOVERNANCE_DEMONSTRATION } from '@/fixtures/governance/committed';
import { dossierActs, treasuryActs } from './acts';
import { GovernedActs } from './GovernedActs';

describe('the register of governed acts', () => {
  it('lists every act with its review, grant and dispatch, and opens one', async () => {
    const user = userEvent.setup();
    render(<GovernedActs acts={treasuryActs(GOVERNANCE_DEMONSTRATION.treasury)} label="Simulated treasury proposals" selectionKey="t" />);
    expect(screen.getAllByRole('row')).toHaveLength(12);
    expect(screen.queryByTestId('governed-inspector')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^TP-4/ }));
    const inspector = screen.getByTestId('governed-inspector');
    expect(within(inspector).getByTestId('act-authorization')).toHaveTextContent('TA-4');
    expect(within(inspector).getByTestId('act-revocation')).toHaveTextContent('Revoked by operator:treasurer');
    expect(within(inspector).getByTestId('act-refused')).toHaveTextContent('treasury_dispatch_after_revocation');
    expect(within(inspector).getByTestId('act-dispatch')).toHaveTextContent('Not dispatched');

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('governed-inspector')).toBeNull();
  });

  it('says when nobody reviewed, and carries an unresolved outcome as unresolved', async () => {
    const user = userEvent.setup();
    render(<GovernedActs acts={treasuryActs(GOVERNANCE_DEMONSTRATION.treasury)} label="Simulated treasury proposals" selectionKey="t" />);
    await user.click(screen.getByRole('button', { name: /^TP-9/ }));
    expect(screen.getByTestId('act-review')).toHaveTextContent('Nobody reviewed it');
    expect(screen.getByTestId('act-refused')).toHaveTextContent('proposal_stays_within_the_entity');
    await user.click(screen.getByRole('button', { name: /^TP-10/ }));
    expect(screen.getByTestId('act-reconciliation')).toHaveTextContent('STILL_UNKNOWN');
    expect(screen.getByTestId('act-dispatch')).toHaveTextContent('OUTCOME_UNKNOWN');
  });

  it('shows the digest the review was of, and the lineage of a correction', async () => {
    const user = userEvent.setup();
    render(<GovernedActs acts={dossierActs(GOVERNANCE_DEMONSTRATION.dossier)} label="Dossier acts" selectionKey="d" />);
    await user.click(screen.getByRole('button', { name: /^P-DOSSIER-RELEASE-2/ }));
    expect(screen.getByTestId('act-digest')).toHaveTextContent(GOVERNANCE_DEMONSTRATION.dossier.releases[1].releaseDigest);
    expect(screen.getByTestId('act-lineage')).toHaveTextContent(`Corrects operation ${GOVERNANCE_DEMONSTRATION.dossier.releases[0].delivery.operationId}`);
    expect(screen.getByTestId('act-dispatch')).toHaveTextContent('SIMULATED_LOCAL:');
  });
});
