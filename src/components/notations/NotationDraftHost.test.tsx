import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotationDraftHost } from './NotationDraftHost';
import { publishDraftStatus, requestDraftController, useNotationDraftStatus } from './draftStatus';

/**
 * The host is what the root layout renders instead of the draft provider, so
 * the editor's module stays out of every route's bundle. Two things have to
 * be true of it and of the status store beside it.
 */
const loadProvider = vi.fn();
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    // The loader is what next/dynamic would run on first render: it is the
    // import of the controller's module, and the test counts it.
    return function Dynamic() { loadProvider(loader); return <div data-testid="draft-provider" />; };
  },
}));

function Marker() {
  const status = useNotationDraftStatus();
  return <span data-testid="status">{status ? `${status.unsaved}:${status.pendingCount}:${status.textCount}` : 'none'}</span>;
}

afterEach(() => { loadProvider.mockClear(); publishDraftStatus(null); });

describe('NotationDraftHost', () => {
  it('renders nothing, and loads nothing, until the workspace asks for the controller; then it mounts it', () => {
    const view = render(<NotationDraftHost />);
    expect(view.container).toBeEmptyDOMElement();
    expect(loadProvider).not.toHaveBeenCalled();
    act(() => requestDraftController());
    expect(screen.getByTestId('draft-provider')).toBeInTheDocument();
    expect(loadProvider).toHaveBeenCalledTimes(1);
  });

  it('gives the rail a status it can read on any route, and only when a field changes', () => {
    render(<Marker />);
    expect(screen.getByTestId('status')).toHaveTextContent('none');
    act(() => publishDraftStatus({ unsaved: true, pendingCount: 2, textCount: 1, inFlight: null }));
    expect(screen.getByTestId('status')).toHaveTextContent('true:2:1');
    act(() => publishDraftStatus({ unsaved: true, pendingCount: 2, textCount: 1, inFlight: null }));
    expect(screen.getByTestId('status')).toHaveTextContent('true:2:1');
    act(() => publishDraftStatus(null));
    expect(screen.getByTestId('status')).toHaveTextContent('none');
  });
});
