/**
 * DUO BLOCKS — campaign screen.
 * 10 chapters as accordion sections; each opens a 5-col grid of its 50
 * levels: locked (🔒 dim), playable (bright), completed (✓ + ★ stars).
 * LEVELS/CHAPTERS come from the levels catalogue workstream — only the
 * documented contract (LEVELS: LevelDef[], CHAPTERS: Chapter[]) is used.
 */
import { useMemo, useState } from 'react';
import type { LevelDef } from '../types/game';
import type { Chapter } from '../types/game';
import { CHAPTERS, LEVELS } from '../data/levels';
import { useGameStore } from '../store/gameStore';
import { usePlayerStore } from '../store/playerStore';
import { campaignUnlockedUpTo, levelStatus, type LevelProgressRecord } from './levelState';
import { goScreen } from '../screens';
import { ACCENT, BackHeader, ScreenShell, type AccentKey } from '../components/Shared';

const CHAPTER_ART: { emoji: string; accent: AccentKey }[] = [
  { emoji: '🌱', accent: 'mint' },
  { emoji: '🧩', accent: 'cyan' },
  { emoji: '🌊', accent: 'violet' },
  { emoji: '🔥', accent: 'coral' },
  { emoji: '⚡', accent: 'yellow' },
  { emoji: '🌀', accent: 'cyan' },
  { emoji: '💎', accent: 'violet' },
  { emoji: '🔭', accent: 'mint' },
  { emoji: '🌋', accent: 'coral' },
  { emoji: '👑', accent: 'yellow' },
];

function LevelButton({
  level,
  record,
  unlockedUpTo,
}: {
  level: LevelDef;
  record: LevelProgressRecord | undefined;
  unlockedUpTo: number;
}) {
  const startGame = useGameStore(s => s.startGame);
  const status = levelStatus(level, record, unlockedUpTo);

  if (status === 'locked') {
    return (
      <span
        title="Locked — finish earlier levels first"
        className="flex h-11 items-center justify-center rounded-lg border border-white/5 bg-white/[0.04] text-xs text-[var(--db-text-dim)]/50"
      >
        🔒
      </span>
    );
  }

  const completed = status === 'completed';
  const stars = record?.stars ?? 0;

  function play() {
    startGame({ mode: 'campaign', level });
    goScreen('game');
  }

  return (
    <button
      type="button"
      onClick={play}
      title={`${level.number}. ${level.name} · difficulty ${level.difficulty}/5`}
      className={`flex h-11 flex-col items-center justify-center rounded-lg text-[0.7rem] leading-none font-black text-[#0B1026] transition active:scale-95 ${
        completed
          ? 'bg-gradient-to-br from-[var(--db-mint)] to-[#047857]'
          : 'bg-gradient-to-br from-[var(--db-cyan)] to-[var(--db-violet)]'
      }`}
    >
      <span>{completed ? `✓${level.number}` : level.number}</span>
      <span className={`mt-0.5 text-[0.5rem] ${completed ? 'text-[#0B1026]' : 'text-[#0B1026]/70'}`}>
        {completed ? '★'.repeat(stars) || '✓' : '▶'}
      </span>
    </button>
  );
}

export default function CampaignScreen() {
  const progress = usePlayerStore(s => s.progress);
  const unlockedUpTo = useMemo(() => campaignUnlockedUpTo(LEVELS, progress.levels), [progress.levels]);

  const firstPlayable = useMemo(
    () => LEVELS.find(l => levelStatus(l, progress.levels[l.id], unlockedUpTo) === 'playable'),
    [progress.levels, unlockedUpTo],
  );
  const [open, setOpen] = useState<number | null>(firstPlayable?.chapter ?? CHAPTERS[0]?.index ?? 1);

  const totalStars = useMemo(
    () => Object.values(progress.levels).reduce((n, rec) => n + rec.stars, 0),
    [progress.levels],
  );
  const totalCompleted = useMemo(
    () => Object.values(progress.levels).filter(rec => rec.stars > 0).length,
    [progress.levels],
  );

  // Empty catalogue (levels workstream still landing) — render gracefully.
  if (LEVELS.length === 0 || CHAPTERS.length === 0) {
    return (
      <ScreenShell>
        <BackHeader title="Campaign" sub="500 levels · 10 chapters" />
        <div className="rounded-[var(--db-radius)] border border-white/10 bg-white/5 p-6 text-center text-sm text-[var(--db-text-dim)]">
          Chapters are being forged… 🛠️
        </div>
      </ScreenShell>
    );
  }

  const chapters = [...CHAPTERS].sort((a, b) => a.index - b.index);

  return (
    <ScreenShell>
      <BackHeader title="Campaign" sub="500 levels · 10 chapters" />

      <div className="flex items-center gap-3 rounded-[var(--db-radius)] border border-white/10 bg-white/5 p-4">
        <span aria-hidden className="text-2xl">🗺️</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {totalCompleted}/{LEVELS.length} completed
          </p>
          <p className="text-[0.68rem] text-[var(--db-text-dim)]">
            Next up: level {Math.min(unlockedUpTo + 1, LEVELS.length)} · {totalStars} ★ earned
          </p>
        </div>
      </div>

      {chapters.map(ch => {
        const art = CHAPTER_ART[(ch.index - 1) % CHAPTER_ART.length];
        const a = ACCENT[art.accent];
        const levels = LEVELS.filter(l => l.chapter === ch.index).sort((x, y) => x.number - y.number);
        const done = levels.filter(l => (progress.levels[l.id]?.stars ?? 0) > 0).length;
        const stars = levels.reduce((n, l) => n + (progress.levels[l.id]?.stars ?? 0), 0);
        const isOpen = open === ch.index;

        return (
          <section key={ch.index} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : ch.index)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <span aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${a.grad}`}>
                {art.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">
                  {ch.index}. {ch.title}
                </span>
                <span className="block truncate text-[0.68rem] text-[var(--db-text-dim)]">{ch.blurb}</span>
                <span className="mt-0.5 block text-[0.68rem] font-bold">
                  <span className={a.text}>
                    {done}/{levels.length} completed
                  </span>
                  <span className="text-[var(--db-yellow)]"> · {'★'.repeat(Math.min(stars, 5))}{stars > 5 ? ` ${stars}` : ''}</span>
                </span>
              </span>
              <span aria-hidden className={`shrink-0 text-[var(--db-text-dim)] transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>

            {isOpen && (
              <div className="grid grid-cols-5 gap-2 p-4 pt-1">
                {levels.map(level => (
                  <LevelButton key={level.id} level={level} record={progress.levels[level.id]} unlockedUpTo={unlockedUpTo} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </ScreenShell>
  );
}
