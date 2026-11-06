/**
 * DUO BLOCKS — profile screen.
 * Avatar + username, local totals, the 8 master-plan achievement badges
 * (locked/unlocked from playerStore.achievements ids), local progress
 * summary and sign out.
 */
import { useMemo } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { goScreen } from '../screens';
import { BackHeader, PlayerAvatar, PrimaryButton, ScreenShell, SectionTitle, StatCard } from '../components/Shared';

/** The 8 predefined badges from the master plan (ids match the backend). */
const BADGES: { id: string; label: string; emoji: string }[] = [
  { id: 'first-victory', label: 'First Victory', emoji: '🥇' },
  { id: 'puzzle-master', label: 'Puzzle Master', emoji: '🧩' },
  { id: '10-level-streak', label: '10-Level Streak', emoji: '🔥' },
  { id: 'combo-king', label: 'Combo King', emoji: '💥' },
  { id: '100-levels-completed', label: '100 Levels Completed', emoji: '🏔️' },
  { id: 'challenge-champion', label: 'Challenge Champion', emoji: '⚔️' },
  { id: 'daily-duo-champion', label: 'Daily Duo Champion', emoji: '📅' },
  { id: '10-consecutive-wins', label: '10 Consecutive Wins', emoji: '🎯' },
];

export default function ProfileScreen() {
  const profile = usePlayerStore(s => s.profile);
  const progress = usePlayerStore(s => s.progress);
  const achievements = usePlayerStore(s => s.achievements);
  const configured = usePlayerStore(s => s.configured);
  const signOut = usePlayerStore(s => s.signOut);

  const unlocked = useMemo(() => new Set(achievements), [achievements]);

  const totals = useMemo(() => {
    const records = Object.values(progress.levels);
    return {
      levelsCompleted: records.filter(r => r.stars > 0).length,
      stars: records.reduce((n, r) => n + r.stars, 0),
    };
  }, [progress.levels]);

  async function handleSignOut() {
    await signOut();
    goScreen('auth');
  }

  return (
    <ScreenShell>
      <BackHeader title="Profile" sub="Your block-solving legend" />

      <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <PlayerAvatar name={profile?.username ?? 'Cyril'} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-xl font-black">{profile?.username ?? 'Player'}</p>
          <p className="text-[0.68rem] text-[var(--db-text-dim)]">
            Member since {profile ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          </p>
          {!configured && <p className="mt-1 text-[0.65rem] font-bold text-[var(--db-mint)]">Local mode profile</p>}
        </div>
      </div>

      <SectionTitle accent="cyan">Totals</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Highest score" value={progress.highestScore.toLocaleString()} accent="cyan" emoji="🏅" />
        <StatCard label="Endless best" value={progress.endless.best.toLocaleString()} sub={`${progress.endless.games} runs`} accent="violet" emoji="♾️" />
        <StatCard label="Levels completed" value={`${totals.levelsCompleted}/500`} sub={`${totals.stars} ★ earned`} accent="mint" emoji="🗺️" />
        <StatCard label="Blocks placed" value={progress.stats.totalBlocks.toLocaleString()} sub={`${progress.stats.totalLines.toLocaleString()} lines cleared`} accent="coral" emoji="🧱" />
      </div>

      <SectionTitle accent="yellow" right={<span className="text-[0.65rem] font-bold text-[var(--db-text-dim)]">{unlocked.size}/{BADGES.length}</span>}>
        Achievements
      </SectionTitle>
      <div className="grid grid-cols-4 gap-2.5">
        {BADGES.map(badge => {
          const isUnlocked = unlocked.has(badge.id);
          return (
            <div
              key={badge.id}
              title={isUnlocked ? `${badge.label} — unlocked!` : `${badge.label} — locked`}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center ${
                isUnlocked ? 'border-[var(--db-yellow)]/40 bg-[var(--db-yellow)]/10' : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <span aria-hidden className={`text-2xl ${isUnlocked ? '' : 'opacity-30 grayscale'}`}>{badge.emoji}</span>
              <span className={`text-[0.55rem] leading-tight font-bold ${isUnlocked ? 'text-[var(--db-text)]' : 'text-[var(--db-text-dim)]/70'}`}>
                {badge.label}
              </span>
              {!isUnlocked && <span aria-hidden className="text-[0.6rem]">🔒</span>}
            </div>
          );
        })}
      </div>

      <SectionTitle accent="mint">Local progress</SectionTitle>
      <div className="rounded-[var(--db-radius)] border border-white/10 bg-white/5 p-4 text-[0.7rem] leading-relaxed text-[var(--db-text-dim)]">
        <p>
          Best endless combo: <span className="font-black text-[var(--db-text)]">{progress.endless.longestCombo}</span> · Total runs:{' '}
          <span className="font-black text-[var(--db-text)]">{progress.endless.games}</span>
        </p>
        <p className="mt-1">
          Longest win streak: <span className="font-black text-[var(--db-text)]">{progress.stats.longestWinStreak}</span>
        </p>
        <p className="mt-1">
          Last saved: {progress.lastSavedAt ? new Date(progress.lastSavedAt).toLocaleString('en-GB') : '—'}
        </p>
      </div>

      <PrimaryButton tone="coral" onClick={() => void handleSignOut()}>
        👋 Sign out
      </PrimaryButton>
    </ScreenShell>
  );
}
