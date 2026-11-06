/**
 * DUO BLOCKS — shared UI atoms used by every shell screen.
 * Styling leans on the design tokens from src/styles/theme.css;
 * no images anywhere — CSS gradients + emoji only.
 */
import type { ReactNode } from 'react';
import { useAppStore } from '../store/appStore';
import { goScreen } from '../screens';

// ------------------------------------------------------------------ accents --

export type AccentKey = 'violet' | 'cyan' | 'coral' | 'yellow' | 'mint';

/** Literal Tailwind classes per accent (static strings so JIT picks them up). */
export const ACCENT: Record<AccentKey, { text: string; grad: string; ring: string; chip: string }> = {
  violet: {
    text: 'text-[var(--db-violet)]',
    grad: 'bg-gradient-to-br from-[var(--db-violet)] to-[#6d28d9]',
    ring: 'ring-[var(--db-violet)]/50',
    chip: 'bg-[var(--db-violet)]/15 text-[var(--db-violet)]',
  },
  cyan: {
    text: 'text-[var(--db-cyan)]',
    grad: 'bg-gradient-to-br from-[var(--db-cyan)] to-[#0e7490]',
    ring: 'ring-[var(--db-cyan)]/50',
    chip: 'bg-[var(--db-cyan)]/15 text-[var(--db-cyan)]',
  },
  coral: {
    text: 'text-[var(--db-coral)]',
    grad: 'bg-gradient-to-br from-[var(--db-coral)] to-[#be123c]',
    ring: 'ring-[var(--db-coral)]/50',
    chip: 'bg-[var(--db-coral)]/15 text-[var(--db-coral)]',
  },
  yellow: {
    text: 'text-[var(--db-yellow)]',
    grad: 'bg-gradient-to-br from-[var(--db-yellow)] to-[#b45309]',
    ring: 'ring-[var(--db-yellow)]/50',
    chip: 'bg-[var(--db-yellow)]/15 text-[var(--db-yellow)]',
  },
  mint: {
    text: 'text-[var(--db-mint)]',
    grad: 'bg-gradient-to-br from-[var(--db-mint)] to-[#047857]',
    ring: 'ring-[var(--db-mint)]/50',
    chip: 'bg-[var(--db-mint)]/15 text-[var(--db-mint)]',
  },
};

// --------------------------------------------------------------- screen shell --

/** Mobile-first page frame: max-width 480px centered, safe-area padding, no horizontal scroll. */
export function ScreenShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen w-full overflow-x-hidden ${className}`}>
      <div className="safe-top safe-bottom mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 pt-4 pb-10">
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- avatar --

export function PlayerAvatar({
  name,
  size = 'md',
  online,
}: {
  name: 'Cyril' | 'Yayra';
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
}) {
  const dims = size === 'sm' ? 'h-9 w-9 text-sm' : size === 'lg' ? 'h-20 w-20 text-3xl' : 'h-12 w-12 text-lg';
  const grad = name === 'Cyril' ? ACCENT.violet.grad : ACCENT.cyan.grad;
  const emoji = name === 'Cyril' ? '🛡️' : '🌙';
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`db-pop inline-flex items-center justify-center rounded-2xl ${dims} ${grad} font-black text-[#0B1026] shadow-[var(--db-shadow)]`}
      >
        {name.charAt(0)}
      </span>
      <span aria-hidden className="absolute -right-1.5 -bottom-1 text-[0.7em]">
        {emoji}
      </span>
      {online !== undefined && (
        <span
          aria-label={online ? 'online' : 'offline'}
          className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ring-2 ring-[var(--db-bg-0)] ${
            online ? 'bg-[var(--db-mint)]' : 'bg-slate-500'
          }`}
        />
      )}
    </span>
  );
}

// ------------------------------------------------------------------ stat card --

export function StatCard({
  label,
  value,
  sub,
  accent = 'cyan',
  emoji,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: AccentKey;
  emoji?: string;
}) {
  return (
    <div className="db-float-in rounded-[var(--db-radius)] border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-1.5">
        {emoji && <span aria-hidden>{emoji}</span>}
        <span className="text-[0.62rem] font-bold tracking-[0.16em] text-[var(--db-text-dim)] uppercase">{label}</span>
      </div>
      <div className={`mt-1 text-xl font-black ${ACCENT[accent].text}`}>{value}</div>
      {sub && <div className="text-[0.65rem] text-[var(--db-text-dim)]">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------------- buttons --

export type ButtonTone = AccentKey;

export function PrimaryButton({
  children,
  onClick,
  disabled,
  tone = 'violet',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: ButtonTone;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl px-4 py-3.5 text-xs font-black tracking-[0.14em] text-[#0B1026] uppercase shadow-[var(--db-shadow)] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${
        ACCENT[tone].grad
      } ${className}`}
    >
      {children}
    </button>
  );
}

// ----------------------------------------------------------------- headings --

export function SectionTitle({
  children,
  right,
  accent = 'cyan',
}: {
  children: ReactNode;
  right?: ReactNode;
  accent?: AccentKey;
}) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <h2 className={`text-[0.7rem] font-black tracking-[0.24em] uppercase ${ACCENT[accent].text}`}>{children}</h2>
      {right}
    </div>
  );
}

/** Header with a back button that always returns to the home screen. */
export function BackHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Back to home"
        onClick={() => goScreen('home')}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg transition active:scale-95"
      >
        ←
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-lg leading-tight font-black">{title}</h1>
        {sub && <p className="truncate text-[0.7rem] text-[var(--db-text-dim)]">{sub}</p>}
      </div>
    </header>
  );
}

// -------------------------------------------------------------------- toast --

export function Toast({
  message,
  tone = 'info',
  actionLabel,
  onAction,
}: {
  message: string;
  tone?: 'info' | 'error' | 'success';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const border =
    tone === 'error'
      ? 'border-[var(--db-coral)]/40'
      : tone === 'success'
        ? 'border-[var(--db-mint)]/40'
        : 'border-[var(--db-cyan)]/40';
  return (
    <div
      role="status"
      className={`db-pop fixed inset-x-0 bottom-6 z-[60] mx-auto flex w-max max-w-[90vw] items-center gap-3 rounded-xl border ${border} bg-[var(--db-bg-1)] px-4 py-2.5 text-xs font-semibold shadow-[var(--db-shadow)]`}
    >
      <span>{message}</span>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg bg-white/10 px-3 py-1 text-[0.7rem] font-black tracking-wider uppercase transition active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Friendly card shown by multiplayer screens when Supabase is not configured. */
export function LocalModeHint({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-[var(--db-radius)] border border-[var(--db-mint)]/30 bg-[var(--db-mint)]/10 p-4 text-xs leading-relaxed text-[var(--db-text-dim)]">
      <span className="font-black text-[var(--db-mint)]">Local mode — </span>
      {children ?? 'Multiplayer activates after Supabase setup.'}
    </div>
  );
}
