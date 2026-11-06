/**
 * DUO BLOCKS — 1-vs-1 challenge service (sender challenges the other room member).
 * Rows live in `challenges`; RLS lets only sender/recipient read or update.
 */
import type { Challenge } from '../types/services';
import { supabase } from './supabaseClient';

const CHALLENGE_WINDOW_MS = 24 * 60 * 60 * 1000; // sender-issued 24h window

/** Maps a `challenges` row to the Challenge contract shape. */
export function mapChallengeRow(row: Record<string, unknown>): Challenge {
  return {
    id: String(row.id),
    sender: String(row.sender),
    recipient: String(row.recipient),
    level_id: String(row.level_id),
    seed: Number(row.seed),
    status: row.status as Challenge['status'],
    expires_at: String(row.expires_at),
    winner: row.winner == null ? null : String(row.winner),
    created_at: String(row.created_at),
  };
}

/** Sender creates a pending challenge with a 24h expiry. */
export async function sendChallenge(
  senderUid: string,
  recipientUid: string,
  levelId: string,
  seed: number,
): Promise<Challenge | null> {
  if (!supabase || senderUid === recipientUid) return null;
  try {
    const { data, error } = await supabase
      .from('challenges')
      .insert({
        sender: senderUid,
        recipient: recipientUid,
        level_id: levelId,
        seed: Math.trunc(seed),
        status: 'pending',
        expires_at: new Date(Date.now() + CHALLENGE_WINDOW_MS).toISOString(),
      })
      .select('*')
      .single();
    if (error || !data) {
      console.warn('[challenges] sendChallenge failed:', error?.message);
      return null;
    }
    return mapChallengeRow(data as Record<string, unknown>);
  } catch (err) {
    console.warn('[challenges] sendChallenge error:', err);
    return null;
  }
}

/** Lists challenges where the caller is sender or recipient. */
export async function listChallenges(uid: string): Promise<Challenge[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .or(`sender.eq.${uid},recipient.eq.${uid}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => mapChallengeRow(r as Record<string, unknown>));
  } catch (err) {
    console.warn('[challenges] listChallenges error:', err);
    return [];
  }
}

/** Recipient accepts, or either side marks the challenge expired. */
export async function resolveChallenge(
  challengeId: string,
  action: 'accept' | 'expire',
): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('challenges')
      .update({ status: action === 'accept' ? 'accepted' : 'expired' })
      .eq('id', challengeId);
    if (error) console.warn('[challenges] resolveChallenge failed:', error.message);
  } catch (err) {
    console.warn('[challenges] resolveChallenge error:', err);
  }
}
