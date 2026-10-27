import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/ui/App';
describe('reader source journey (authored, not executed)', () => {
  it('keeps the notice visible through date changes and shows explicit unknowns', () => {
    render(<App />);
    expect(screen.getByRole('note').textContent).toContain('Not legal advice');
    fireEvent.change(screen.getByLabelText('As of'), { target: { value: '2026-04-15' } });
    expect(screen.getByRole('note').textContent).toContain('Runtime validation pending');
    expect(screen.getByText(/Unapplied A1/)).toBeTruthy();
    expect(screen.getAllByText(/unknown · amendment unapplied/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy();
  });
});
