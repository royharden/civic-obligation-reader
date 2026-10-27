import { supabase } from '../lib/supabase';
import { rulingKeyHash } from './rulings';
import type { RulingEvent } from './rulings';
export interface RemoteRuling {
  event_id: string; key_hash: string; pair_key: string; verdict: string;
  note: string; supersedes_event_id: string | null; created_at: string;
}
export type RemoteResult<T> = { status: 'ok'; value: T } | { status: 'not_configured' | 'signed_out' | 'failed'; message: string };
export async function saveRemoteRuling(event: RulingEvent): Promise<RemoteResult<null>> {
  if (!supabase) return { status: 'not_configured', message: 'Remote sync is not configured; local history is separate.' };
  try {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) return { status: 'signed_out', message: 'Sign in before saving remotely.' };
    const { error } = await supabase.from('rulings').insert({ owner: data.user.id,
      event_id: event.eventId, key_hash: rulingKeyHash(event.key), pair_key: event.key.pairKey,
      verdict: event.verdict, note: event.note, supersedes_event_id: event.supersedesEventId });
    if (error) return { status: 'failed', message: 'Remote ruling was not saved. Local history is unchanged.' };
    return { status: 'ok', value: null };
  } catch { return { status: 'failed', message: 'Remote ruling was not saved. Check the connection.' }; }
}
export async function readRemoteRulings(): Promise<RemoteResult<RemoteRuling[]>> {
  if (!supabase) return { status: 'not_configured', message: 'Remote sync is not configured.' };
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return { status: 'signed_out', message: 'Sign in to load remote metadata.' };
    const { data, error } = await supabase.from('rulings').select('event_id,key_hash,pair_key,verdict,note,supersedes_event_id,created_at').eq('owner', auth.user.id).order('created_at');
    if (error) return { status: 'failed', message: 'Remote history could not be loaded.' };
    return { status: 'ok', value: data as RemoteRuling[] };
  } catch { return { status: 'failed', message: 'Remote history could not be loaded.' }; }
}
