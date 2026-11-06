/**
 * DUO BLOCKS — audio mode toggle (cycles all → sfx-only → mute → all).
 * Small round HUD button matching the pause button visual.
 */
import { useEffect, useState } from 'react';
import { audio, type AudioMode } from '../features/game/audio/audioEngine';

const LABELS: Record<AudioMode, { icon: string; label: string }> = {
  all: { icon: '🔊', label: 'Sound & music on — tap for effects only' },
  sfx: { icon: '♪', label: 'Effects only — tap to mute everything' },
  off: { icon: '🔇', label: 'Muted — tap for full sound' },
};

export function AudioToggle({ className = '' }: { className?: string }) {
  const [mode, setMode] = useState<AudioMode>(audio.getMode());

  useEffect(() => {
    const id = window.setInterval(() => {
      const m = audio.getMode();
      setMode(cur => (cur === m ? cur : m));
    }, 600);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      type="button"
      aria-label={LABELS[mode].label}
      title={LABELS[mode].label}
      onClick={() => {
        audio.cycleMode();
        setMode(audio.getMode());
      }}
      className={
        'flex h-10 w-10 items-center justify-center rounded-full bg-[var(--db-surface)] ' +
        'text-base ring-1 ring-white/10 active:scale-95 ' + className
      }
    >
      {LABELS[mode].icon}
    </button>
  );
}
