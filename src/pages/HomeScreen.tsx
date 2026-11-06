/**
 * DUO BLOCKS — home screen.
 * Greeting + avatar (→ profile), opponent card with live presence dot,
 * stat cards and the five main actions.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { usePlayerStore } from '../store/playerStore';
import { services } from '../services';
import { dailySeed } from './levelState';
import { goScreen } from '../screens';
import { AudioToggle } from '../components/AudioToggle';
import { PlayerAvatar, PrimaryButton, ScreenShell, SectionTitle, StatCard } from '../components/Shared';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const profile = usePlayerStore(s => s.profile);
  const opponent = usePlayerStore(s => s.opponent);
  const progress = usePlayerStore(s => s.progress);
  const stats = usePlayerStore(s => s.stats);
  const configured = usePlayerStore(s => s.configured);
  const refreshStats = usePlayerStore(s => s.refreshStats);
  const startGame = useGameStore(s => s.startGame);

  const [online, setOnline] = useState<string[]>([]);

  // Live presence — only meaningful with Supabase configured.
  useEffect(() => {
    if (!configured) return;
    return services.subscribePresence(setOnline);
  }, [configured]);

  useEffect(() => {
    if (configured) void refreshStats();
  }, [configured, refreshStats]);

  const isOnline = (uid: string | undefined): boolean => (uid ? online.includes(uid) : false);

  // Campaign frontier from local progress (works in local mode too).
  const completedCount = useMemo(
    () => Object.values(progress.levels).filter(rec => rec.stars > 0).length,
    [progress.levels],
  );
  const nextLevel = completedCount + 1;

  const ownStats = useMemo(() => stats.find(r => r.player === profile?.id), [stats, profile?.id]);

  // Daily duo — deterministic seed from the Accra calendar date.
  const dailySeedValue = useMemo(() => dailySeed(), []);
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

  function playDaily() {
    startGame({ mode: 'daily', level: null, sharedSeed: dailySeedValue });
    goScreen('game');
  }

  function playEndless() {
    // Random seed, but kept on the session meta so Retry replays the same run.
    const seed = (Math.random() * 0xffffffff) >>> 0;
    startGame({ mode: 'endless', level: null, sharedSeed: seed });
    goScreen('game');
  }

  return (
    <ScreenShell>
      {/* greeting */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black tracking-[0.22em] text-[var(--db-text-dim)] uppercase">
            {greeting()}
          </p>
          <h1 className="truncate text-2xl font-black">{profile?.username ?? 'Player'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <AudioToggle />
          <button type="button" onClick={() => goScreen('profile')} aria-label="Open profile" className="transition active:scale-95">
            <PlayerAvatar name={profile?.username ?? 'Cyril'} />
          </button>
        </div>
      </header>

      {/* opponent card */}
      <div className="flex items-center gap-3 rounded-[var(--db-radius)] border border-white/10 bg-white/5 p-4">
        <PlayerAvatar name={opponent?.username ?? 'Yayra'} online={opponent ? isOnline(opponent.id) : undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{opponent?.username ?? 'Yayra'}</p>
          <p className="text-[0.68rem] text-[var(--db-text-dim)]">
            {opponent ? (isOnline(opponent.id) ? 'Online — challenge them!' : 'Offline') : 'Your rival — connect Supabase to battle'}
          </p>
        </div>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${opponent && isOnline(opponent.id) ? 'bg-[var(--db-mint)]' : 'bg-slate-500'}`} />
      </div>

      {/* stat cards */}
      <SectionTitle accent="violet">Your stats</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Campaign level" value={`Lv ${nextLevel}`} sub={`${completedCount}/500 completed`} accent="violet" emoji="🧭" />
        <StatCard label="Personal best" value={progress.highestScore.toLocaleString()} sub="all-time top score" accent="cyan" emoji="🏅" />
        <StatCard label="Current streak" value={`${progress.stats.winStreak} 🔥`} sub={`longest ${progress.stats.longestWinStreak}`} accent="coral" />
        <StatCard label="Total wins" value={ownStats?.wins ?? 0} sub="PvP matches won" accent="mint" emoji="🏆" />
      </div>

      {/* daily puzzle card */}
      <div className="rounded-[var(--db-radius)] border border-[var(--db-yellow)]/30 bg-gradient-to-br from-[var(--db-yellow)]/15 to-transparent p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-black tracking-[0.2em] text-[var(--db-yellow)] uppercase">Daily duo</p>
            <p className="mt-0.5 truncate text-sm font-black">{dateLabel}</p>
            <p className="text-[0.65rem] text-[var(--db-text-dim)]">Shared seed #{dailySeedValue} — one board, both minds</p>
          </div>
          <span aria-hidden className="text-3xl">📅</span>
        </div>
      </div>

      {/* main actions */}
      <div className="mt-1 flex flex-col gap-3">
        <PrimaryButton tone="violet" onClick={() => goScreen('campaign')}>
          ▶ Play campaign
        </PrimaryButton>
        <PrimaryButton tone="coral" onClick={() => goScreen('challenges')}>
          ⚔️ Challenge
        </PrimaryButton>
        <PrimaryButton tone="yellow" onClick={playDaily}>
          📅 Daily duo
        </PrimaryButton>
        <PrimaryButton tone="cyan" onClick={playEndless}>
          ♾️ Endless mode
        </PrimaryButton>
        <PrimaryButton tone="mint" onClick={() => goScreen('leaderboard')}>
          🏆 Leaderboard
        </PrimaryButton>
      </div>
    </ScreenShell>
  );
}
