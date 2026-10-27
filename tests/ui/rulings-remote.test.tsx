import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import fixture from '../../fixtures/dev/E01/packet.json';
import { parsePacket } from '../../src/core/packet';
import { extract } from '../../src/core/extract';
import { rulingKeyHash } from '../../src/state/rulings';
import { RulingControls, rowRulingKey } from '../../src/ui/RulingControls';
const remote = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), signOut: vi.fn() }));
vi.mock('../../src/state/rulings-remote', () => ({ readRemoteRulings: remote.read, saveRemoteRuling: remote.save }));
vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signOut: remote.signOut, signInWithOtp: vi.fn(),
} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('remote ruling snapshots (authored, not executed)', () => {
  it('REMOTE-REFRESH-FAIL: successful save plus failed reload never leaves a stale verdict displayed', async () => {
    // what_bug_this_catches: loaded confirmed survives a successful wrong ruling when the follow-up read fails.
    const row = extract(parsePacket(JSON.stringify(fixture)), '2026-02-01')[0]!;
    const data = [{ event_id: 'old', pair_key: row.pairKey, key_hash: rulingKeyHash(rowRulingKey(row)), verdict: 'confirmed', supersedes_event_id: null, note: '', created_at: '2026-10-27' }];
    remote.read.mockResolvedValueOnce({ status: 'ok', value: data }).mockResolvedValueOnce({ status: 'ok', value: data }).mockResolvedValueOnce({ status: 'failed', message: 'Read failed.' });
    remote.save.mockResolvedValue({ status: 'ok', value: null });
    render(<RulingControls row={row} events={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('Owner account and remote metadata'));
    fireEvent.click(screen.getByRole('button', { name: 'Read remote metadata' }));
    await waitFor(() => expect(screen.getByText('Remote review: confirmed')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Save remote: wrong' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Remote metadata was saved. Remote history was not refreshed.'));
    expect(screen.queryByText('Remote review: confirmed')).toBeNull();
  });
  it('REMOTE-SIGNOUT: signing out clears the loaded metadata snapshot', async () => {
    // what_bug_this_catches: a signed-out account leaves its cached review visible.
    const row = extract(parsePacket(JSON.stringify(fixture)), '2026-02-01')[0]!;
    remote.read.mockResolvedValue({ status: 'ok', value: [] }); remote.signOut.mockResolvedValue({ error: null });
    render(<RulingControls row={row} events={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('Owner account and remote metadata'));
    fireEvent.click(screen.getByRole('button', { name: 'Read remote metadata' }));
    await waitFor(() => expect(screen.getByText('Remote review: unreviewed')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.queryByText('Remote review: unreviewed')).toBeNull());
  });
});
