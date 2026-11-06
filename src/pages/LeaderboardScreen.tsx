/**
 * DUO BLOCKS — leaderboard screen.
 * Head-to-head profile vs opponent comparison from playerStore.stats
 * (PlayerStatsRow rows; may be empty in local mode). Timeframe toggle
 * computes client-side from the data we have: all-time rows from
 * player_stats, weekly/monthly match counts from duel history timestamps.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DuelMatch } from '../types/services';
import { usePlayerStore } from '../store/playerStore';
import { services } from '../services';
import { goScreen } from '../screens';
import {
  BackHeader,
  LocalModeHint,
  PlayerAvatar,
  PrimaryButton,
  ScreenShell,
  SectionTitle,
} from '../components/Shared';

type Timeframe = 'all' | 'week' | 'month';

interface CompareRow {
  label: string;
  mine: number | undefined;
  theirs: number | undefined;
}

const ALL_TIME_ROWS: { key: keyof import('../types/services').PlayerStatsRow; label: string }[] = [
  { key: 'total_points', label: 'Points' },
  { key: 'highest_score', label: 'Highest score' },
  { key: 'wins', label: 'Wins' },
  { key: 'losses', label: 'Losses' },
  { key: 'draws', label: 'Draws' },
  { key: 'total_matches', label: 'Matches' },
  { key: 'levels_completed', label: 'Levels' },
  { key: 'daily_wins', label: 'Daily wins' },
  { key: 'daily_current_streak', label: 'Daily streak' },
  { key: 'win_streak', label: 'Win streak' },
];

const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: 'all', label: 'All-time' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

function inWindow(iso: string | null, timeframe: Timeframe): boolean {
  if (timeframe === 'all' || !iso) return timeframe === 'all';
  const days = timeframe === 'week' ? 7 : 30;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) && Date.now() - ts <= days * 86_400_000;
}

function StatusChip({ status }: { status: DuelMatch['status'] }) {
  const map: Record<DuelMatch['status'], string> = {
    waiting: 'bg-[var(--db-yellow)]/15 text-[var(--db-yellow)]',
    active: 'bg-[var(--db-cyan)]/15 text-[var(--db-cyan)]',
    finished: 'bg-[var(--db-mint)]/15 text-[var(--db-mint)]',
    cancelled: 'bg-white/10 text-[var(--db-text-dim)]',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black tracking-wider uppercase ${map[status]}`}>{status}</span>;
}

export default function LeaderboardScreen() {
  const profile = usePlayerStore(s => s.profile);
  const opponent = usePlayerStore(s => s.opponent);
  const stats = usePlayerStore(s => s.stats);
  const configured = usePlayerStore(s => s.configured);
  const refreshStats = usePlayerStore(s => s.refreshStats);

  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [duels, setDuels] = useState<DuelMatch[] | null>(null);

  useEffect(() => {
    if (!configured) return;
    void refreshStats();
    services
      .listDuels()
      .then(rows => setDuels(rows))
      .catch(() => setDuels([]));
  }, [configured, refreshStats]);

  const mine = stats.find(r => r.player === profile?.id);
  const theirs = stats.find(r => r.player === opponent?.id);

  const rows: CompareRow[] = useMemo(() => {
    if (timeframe === 'all') {
      return ALL_TIME_ROWS.map(({ key, label }) => ({
        label,
        mine: typeof mine?.[key] === 'number' ? (mine[key] as number) : undefined,
        theirs: typeof theirs?.[key] === 'number' ? (theirs[key] as number) : undefined,
      }));
    }
    // Period view from duel history (per-period point totals are server-side only).
    const period = (duels ?? []).filter(d => inWindow(d.finished_at ?? d.created_at, timeframe));
    const wins = period.filter(d => d.winner !== null && d.winner === profile?.id).length;
    const losses = period.filter(d => d.winner !== null && d.winner === opponent?.id).length;
    const draws = period.filter(d => d.winner === null).length;
    return [
      { label: 'Points', mine: undefined, theirs: undefined },
      { label: 'Matches', mine: period.length, theirs: period.length },
      { label: 'Wins', mine: wins, theirs: losses },
      { label: 'Draws', mine: draws, theirs: draws },
    ];
  }, [timeframe, mine, theirs, duels, profile?.id, opponent?.id]);

  const duelHistory = useMemo(
    () => (duels ?? []).slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10),
    [duels],
  );

  const myName = profile?.username ?? 'Cyril';
  const theirName = opponent?.username ?? 'Yayra';

  return (
    <ScreenShell>
      <BackHeader title="Leaderboard" sub="Cyril vs Yayra — the eternal scoreboard" />

      {!configured && <LocalModeHint />}

      {/* timeframe toggle */}
      <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.id}
            type="button"
            onClick={() => setTimeframe(tf.id)}
            className={`flex-1 rounded-xl px-2 py-2 text-[0.65rem] font-black tracking-[0.14em] uppercase transition ${
              timeframe === tf.id ? 'bg-gradient-to-br from-[var(--db-violet)] to-[#6d28d9] text-[#0B1026]' : 'text-[var(--db-text-dim)]'
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* comparison table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-[0.62rem] font-black tracking-[0.2em] text-[var(--db-text-dim)] uppercase">Metric</span>
          <span className="flex justify-center">
            <PlayerAvatar name={myName as 'Cyril' | 'Yayra'} size="sm" />
          </span>
          <span className="flex justify-center">
            <PlayerAvatar name={theirName as 'Cyril' | 'Yayra'} size="sm" />
          </span>
        </div>
        {rows.map(row => {
          const mineWins = row.mine !== undefined && row.theirs !== undefined && row.mine > row.theirs;
          const theirsWins = row.theirs !== undefined && row.mine !== undefined && row.theirs > row.mine;
          const cell = (value: number | undefined, highlight: boolean, accent: string) => (
            <span className={`text-center text-xs font-black ${highlight ? accent : 'text-[var(--db-text)]'}`}>
              {value === undefined ? '—' : value.toLocaleString()}
            </span>
          );
          return (
            <div key={row.label} className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2 px-4 py-2.5 not-last:border-b border-white/5">
              <span className="truncate text-[0.7rem] font-bold text-[var(--db-text-dim)]">{row.label}</span>
              {cell(row.mine, mineWins, 'text-[var(--db-cyan)]')}
              {cell(row.theirs, theirsWins, 'text-[var(--db-coral)]')}
            </div>
          );
        })}
      </div>

      {timeframe !== 'all' && (
        <p className="text-center text-[0.65rem] text-[var(--db-text-dim)]">
          Period scores land with Supabase history — match counts come from duel records.
        </p>
      )}

      {/* duel history */}
      <SectionTitle accent="coral">Duel history</SectionTitle>
      {duels === null ? (
        <p className="text-center text-xs text-[var(--db-text-dim)]">
          {configured ? 'Loading duels…' : 'Duel history appears after Supabase setup.'}
        </p>
      ) : duelHistory.length === 0 ? (
        <p className="rounded-[var(--db-radius)] border border-white/10 bg-white/5 p-4 text-center text-xs text-[var(--db-text-dim)]">
          No duels yet — throw down the gauntlet! 🎯
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {duelHistory.map(d => (
            <li key={d.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <span aria-hidden className="text-lg">⚔️</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black">{d.level_id}</p>
                <p className="text-[0.62rem] text-[var(--db-text-dim)]">
                  {new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · seed #{d.seed}
                </p>
              </div>
              <StatusChip status={d.status} />
              <span className="w-14 text-right text-[0.65rem] font-black">
                {d.status !== 'finished' ? '—' : d.winner === null ? 'Draw' : d.winner === profile?.id ? 'Won' : 'Lost'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <PrimaryButton tone="coral" onClick={() => goScreen('duel')}>
        ⚔️ Start a duel
      </PrimaryButton>
    </ScreenShell>
  );
}
