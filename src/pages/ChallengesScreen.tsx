/**
 * DUO BLOCKS — challenges screen.
 * Incoming (recipient = me) and outgoing (sender = me) challenge cards.
 * Accept / View / Rematch through services.listChallenges / resolveChallenge
 * / sendChallenge. Everything is disabled in local mode with a hint.
 * Sending a NEW challenge lives in the dedicated duel flow (DuelScreen).
 */
import { useCallback, useEffect, useState } from 'react';
import type { Challenge } from '../types/services';
import { usePlayerStore } from '../store/playerStore';
import { services } from '../services';
import { goScreen } from '../screens';
import {
  BackHeader,
  LocalModeHint,
  PrimaryButton,
  ScreenShell,
  SectionTitle,
  Toast,
} from '../components/Shared';

function StatusChip({ status }: { status: Challenge['status'] }) {
  const map: Record<Challenge['status'], string> = {
    pending: 'bg-[var(--db-yellow)]/15 text-[var(--db-yellow)]',
    accepted: 'bg-[var(--db-cyan)]/15 text-[var(--db-cyan)]',
    played_by_sender: 'bg-[var(--db-cyan)]/15 text-[var(--db-cyan)]',
    played_by_recipient: 'bg-[var(--db-cyan)]/15 text-[var(--db-cyan)]',
    complete: 'bg-[var(--db-mint)]/15 text-[var(--db-mint)]',
    expired: 'bg-white/10 text-[var(--db-text-dim)]',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black tracking-wider uppercase ${map[status]}`}>{status.replace(/_/g, ' ')}</span>;
}

function hoursLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / 3_600_000);
  return `${hours}h left`;
}

export default function ChallengesScreen() {
  const profile = usePlayerStore(s => s.profile);
  const opponent = usePlayerStore(s => s.opponent);
  const configured = usePlayerStore(s => s.configured);

  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    services
      .listChallenges()
      .then(rows => setChallenges(rows))
      .catch(() => setChallenges([]));
  }, []);

  useEffect(() => {
    if (!configured) return;
    load();
    const unsub = services.subscribeChallenges(() => load());
    return () => {
      unsub();
    };
  }, [configured, load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function accept(challenge: Challenge) {
    setBusyId(challenge.id);
    try {
      await services.resolveChallenge(challenge.id, 'accept');
      setToast('Challenge accepted — may the best mind win!');
      load();
    } catch {
      setToast('Could not accept the challenge — try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function rematch(challenge: Challenge) {
    if (!opponent) return;
    setBusyId(challenge.id);
    try {
      const seed = (Math.random() * 0xffffffff) >>> 0;
      await services.sendChallenge(opponent.id, challenge.level_id, seed);
      setToast('Rematch sent! ⚔️');
      load();
    } catch {
      setToast('Rematch failed — try again.');
    } finally {
      setBusyId(null);
    }
  }

  const incoming = (challenges ?? []).filter(c => c.recipient === profile?.id);
  const outgoing = (challenges ?? []).filter(c => c.sender === profile?.id);
  const otherName = opponent?.username ?? 'Opponent';

  const card = (c: Challenge, dir: 'in' | 'out') => {
    const isExpanded = expanded === c.id;
    const resolvable = c.status === 'pending';
    const rematchable = c.status === 'complete' || c.status === 'expired';
    return (
      <li key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-lg">{dir === 'in' ? '📥' : '📤'}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black">
              {dir === 'in' ? `${otherName} challenges you` : `You challenged ${otherName}`}
            </p>
            <p className="text-[0.62rem] text-[var(--db-text-dim)]">
              Level {c.level_id} · seed #{c.seed} · {hoursLeft(c.expires_at)}
            </p>
          </div>
          <StatusChip status={c.status} />
        </div>
        <div className="mt-2.5 flex gap-2">
          {dir === 'in' && resolvable && (
            <button
              type="button"
              onClick={() => void accept(c)}
              disabled={busyId === c.id}
              className="flex-1 rounded-lg bg-gradient-to-br from-[var(--db-mint)] to-[#047857] px-3 py-2 text-[0.65rem] font-black tracking-wider text-[#0B1026] uppercase transition active:scale-95 disabled:opacity-50"
            >
              {busyId === c.id ? '…' : 'Accept'}
            </button>
          )}
          {rematchable && (
            <button
              type="button"
              onClick={() => void rematch(c)}
              disabled={busyId === c.id || !opponent}
              className="flex-1 rounded-lg bg-gradient-to-br from-[var(--db-coral)] to-[#be123c] px-3 py-2 text-[0.65rem] font-black tracking-wider text-[#0B1026] uppercase transition active:scale-95 disabled:opacity-50"
            >
              {busyId === c.id ? '…' : 'Rematch'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(isExpanded ? null : c.id)}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[0.65rem] font-black tracking-wider text-[var(--db-text-dim)] uppercase transition active:scale-95"
          >
            {isExpanded ? 'Hide' : 'View'}
          </button>
        </div>
        {isExpanded && (
          <dl className="mt-2.5 grid grid-cols-2 gap-1 border-t border-white/10 pt-2.5 text-[0.62rem] text-[var(--db-text-dim)]">
            <dt>Challenge id</dt>
            <dd className="truncate text-right font-mono text-[var(--db-text)]">{c.id}</dd>
            <dt>Shared seed</dt>
            <dd className="text-right font-mono text-[var(--db-text)]">{c.seed}</dd>
            <dt>Expires at</dt>
            <dd className="text-right text-[var(--db-text)]">{new Date(c.expires_at).toLocaleString('en-GB')}</dd>
            <dt>Status</dt>
            <dd className="text-right text-[var(--db-text)]">{c.status}</dd>
          </dl>
        )}
      </li>
    );
  };

  return (
    <ScreenShell>
      <BackHeader title="Challenges" sub="Straight throws and answered gauntlets" />

      {!configured && <LocalModeHint />}

      <PrimaryButton tone="coral" onClick={() => goScreen('duel')} disabled={!configured}>
        ⚔️ Send a new challenge
      </PrimaryButton>

      <SectionTitle accent="cyan" right={<span className="text-[0.65rem] font-bold text-[var(--db-text-dim)]">{incoming.length}</span>}>
        Incoming
      </SectionTitle>
      {!configured || incoming.length === 0 ? (
        <p className="rounded-[var(--db-radius)] border border-white/10 bg-white/5 p-4 text-center text-xs text-[var(--db-text-dim)]">
          {configured ? 'No incoming challenges — inbox zero 🧘' : 'Challenges arrive after Supabase setup.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">{incoming.map(c => card(c, 'in'))}</ul>
      )}

      <SectionTitle accent="violet" right={<span className="text-[0.65rem] font-bold text-[var(--db-text-dim)]">{outgoing.length}</span>}>
        Outgoing
      </SectionTitle>
      {!configured || outgoing.length === 0 ? (
        <p className="rounded-[var(--db-radius)] border border-white/10 bg-white/5 p-4 text-center text-xs text-[var(--db-text-dim)]">
          {configured ? 'Nothing sent yet — pick a level and fire one off!' : 'Sent challenges appear after Supabase setup.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">{outgoing.map(c => card(c, 'out'))}</ul>
      )}

      {toast && <Toast message={toast} tone="success" />}
    </ScreenShell>
  );
}
