/**
 * DUO BLOCKS — duel screen.
 * Create a duel: pick a level from the catalogue, services.createDuel, then
 * startGame({ mode: 'duel', level, sharedSeed: match.seed, matchId }) and
 * jump into the game screen. Also lists pending/active matches.
 * Disabled in local mode with a hint.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DuelMatch } from '../types/services';
import { CHAPTERS, LEVELS } from '../data/levels';
import { useGameStore } from '../store/gameStore';
import { usePlayerStore } from '../store/playerStore';
import { services } from '../services';
import { goScreen } from '../screens';
import { BackHeader, LocalModeHint, PrimaryButton, ScreenShell, SectionTitle, Toast } from '../components/Shared';

function StatusChip({ status }: { status: DuelMatch['status'] }) {
  const map: Record<DuelMatch['status'], string> = {
    waiting: 'bg-[var(--db-yellow)]/15 text-[var(--db-yellow)]',
    active: 'bg-[var(--db-cyan)]/15 text-[var(--db-cyan)]',
    finished: 'bg-[var(--db-mint)]/15 text-[var(--db-mint)]',
    cancelled: 'bg-white/10 text-[var(--db-text-dim)]',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black tracking-wider uppercase ${map[status]}`}>{status}</span>;
}

const selectClass =
  'w-full rounded-xl border border-white/10 bg-[var(--db-bg-1)] px-3 py-2.5 text-sm text-[var(--db-text)] outline-none focus:border-[var(--db-violet)]/60';

export default function DuelScreen() {
  const configured = usePlayerStore(s => s.configured);
  const profile = usePlayerStore(s => s.profile);
  const startGame = useGameStore(s => s.startGame);

  const [chapterIdx, setChapterIdx] = useState<number>(CHAPTERS[0]?.index ?? 1);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [matches, setMatches] = useState<DuelMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    services
      .listDuels()
      .then(rows => setMatches(rows))
      .catch(() => setMatches([]));
  }, [configured]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const chapterLevels = useMemo(
    () => LEVELS.filter(l => l.chapter === chapterIdx).sort((a, b) => a.number - b.number),
    [chapterIdx],
  );
  const selectedLevel = useMemo(() => LEVELS.find(l => l.id === levelId) ?? null, [levelId]);
  const chapterOptions = useMemo(() => {
    if (CHAPTERS.length > 0) return [...CHAPTERS].sort((a, b) => a.index - b.index);
    return [...new Set(LEVELS.map(l => l.chapter))].sort((a, b) => a - b).map(index => ({ index }));
  }, []);

  function playMatch(match: DuelMatch) {
    const level = LEVELS.find(l => l.id === match.level_id) ?? null;
    if (!level) return;
    startGame({ mode: 'duel', level, sharedSeed: match.seed, matchId: match.id });
    goScreen('game');
  }

  async function createDuel() {
    if (!selectedLevel) {
      setError('Pick a level first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Proposed seed: the level's own deterministic one; the match row is
      // authoritative and its seed drives BOTH players' boards.
      const match = await services.createDuel(selectedLevel.id, selectedLevel.seed);
      if (!match) {
        setError('Could not create the duel — is Supabase configured?');
        return;
      }
      startGame({ mode: 'duel', level: selectedLevel, sharedSeed: match.seed, matchId: match.id });
      goScreen('game');
    } catch {
      setError('Duel creation failed — try again.');
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (levelId_: string): string => LEVELS.find(l => l.id === levelId_)?.name ?? levelId_;

  return (
    <ScreenShell>
      <BackHeader title="Duel" sub="Same level, same seed — sharper mind wins" />

      {!configured && (
        <LocalModeHint>
          Duels need Supabase for matchmaking. Set the project up, then pick a level and fire.
        </LocalModeHint>
      )}

      {/* create duel */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-[0.62rem] font-black tracking-[0.2em] text-[var(--db-text-dim)] uppercase">Pick your battlefield</p>

        <select
          value={chapterIdx}
          onChange={e => {
            setChapterIdx(Number(e.target.value));
            setLevelId(null);
          }}
          disabled={!configured}
          className={selectClass}
          aria-label="Chapter"
        >
          {chapterOptions.map(ch => (
            <option key={ch.index} value={ch.index}>
              Chapter {ch.index}
              {'title' in ch ? ` — ${ch.title}` : ''}
            </option>
          ))}
        </select>

        <select
          value={levelId ?? ''}
          onChange={e => setLevelId(e.target.value || null)}
          disabled={!configured}
          className={selectClass}
          aria-label="Level"
        >
          <option value="">Pick a level…</option>
          {chapterLevels.map(level => (
            <option key={level.id} value={level.id}>
              {level.number}. {level.name} · difficulty {level.difficulty}/5
            </option>
          ))}
        </select>

        {error && <p className="text-xs font-bold text-[var(--db-coral)]">{error}</p>}

        <PrimaryButton tone="coral" onClick={() => void createDuel()} disabled={!configured || busy || !selectedLevel}>
          {busy ? 'Creating…' : '⚔️ Create duel'}
        </PrimaryButton>
        {selectedLevel && (
          <p className="text-center text-[0.65rem] text-[var(--db-text-dim)]">
            Level {selectedLevel.number}. {selectedLevel.name} — identical seed for both players
          </p>
        )}
      </div>

      {/* match list */}
      <SectionTitle accent="cyan">Matches</SectionTitle>
      {matches === null ? (
        <p className="text-center text-xs text-[var(--db-text-dim)]">
          {configured ? 'Loading matches…' : 'Match list appears after Supabase setup.'}
        </p>
      ) : matches.length === 0 ? (
        <p className="rounded-[var(--db-radius)] border border-white/10 bg-white/5 p-4 text-center text-xs text-[var(--db-text-dim)]">
          No duels yet — create the first one! 🥊
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {matches
            .slice()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map(match => (
              <li key={match.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <span aria-hidden className="text-lg">⚔️</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black">{nameOf(match.level_id)}</p>
                  <p className="text-[0.62rem] text-[var(--db-text-dim)]">
                    seed #{match.seed} · {new Date(match.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    {match.winner ? (match.winner === profile?.id ? ' · you won 🏆' : ' · lost') : ''}
                  </p>
                </div>
                <StatusChip status={match.status} />
                {match.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => playMatch(match)}
                    className="shrink-0 rounded-lg bg-gradient-to-br from-[var(--db-cyan)] to-[#0e7490] px-3 py-1.5 text-[0.65rem] font-black tracking-wider text-[#0B1026] uppercase transition active:scale-95"
                  >
                    Play
                  </button>
                )}
              </li>
            ))}
        </ul>
      )}

      {toast && <Toast message={toast} tone="success" />}
    </ScreenShell>
  );
}
