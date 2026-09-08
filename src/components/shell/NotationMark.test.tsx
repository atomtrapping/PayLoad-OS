/**
 * The mark is decoration beside a name, not a second name.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NotationMark } from './NotationMark';

describe('the Notation Systems mark', () => {
  it('is hidden from assistive technology, because the link beside it already carries the name', () => {
    render(<NotationMark />);
    const mark = screen.getByTestId('notation-mark');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveAttribute('focusable', 'false');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('paints in currentColor and carries no ground, so it reads in either theme', () => {
    render(<NotationMark size={24} />);
    const mark = screen.getByTestId('notation-mark');
    expect(mark).toHaveAttribute('fill', 'currentColor');
    expect(mark).toHaveAttribute('width', '24');
    expect(mark.querySelector('rect')).toBeNull();
  });

  /**
   * One shape, two files. The favicon needs its own ground because a browser tab
   * supplies none; the geometry must still be the same mark, so the path is
   * compared rather than trusted to have been copied.
   */
  it('draws the same geometry as the favicon', () => {
    render(<NotationMark />);
    const icon = readFileSync(resolve(process.cwd(), 'src/app/icon.svg'), 'utf8');
    const path = screen.getByTestId('notation-mark').querySelector('path')?.getAttribute('d');
    expect(path).toBeTruthy();
    expect(icon).toContain(path!);
    expect(icon).toContain('rotate(-18 33 73)');
    // The favicon, and only the favicon, paints a ground.
    expect(icon).toContain('<rect');
  });
});
