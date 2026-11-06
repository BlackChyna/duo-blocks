/**
 * DUO BLOCKS — auth screen.
 * Logo (pure CSS blocks grid), two big avatar buttons (CYRIL / YAYRA),
 * password field, sign-in through usePlayerStore.signIn.
 * Without a configured Supabase project the app runs in local mode:
 * a green banner explains it and sign-in creates a provisional profile.
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { usePlayerStore } from '../store/playerStore';
import { goScreen } from '../screens';
import { PlayerAvatar, PrimaryButton, ScreenShell, Toast } from '../components/Shared';

type PlayerName = 'Cyril' | 'Yayra';

const BLOCK_COLORS = ['var(--db-violet)', 'var(--db-cyan)', 'var(--db-coral)', 'var(--db-yellow)'];

/** 2×2 block glyph — CSS gradients, no images. */
function LogoBlocks() {
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-[var(--db-bg-1)] p-2.5 shadow-[var(--db-shadow)]">
      {BLOCK_COLORS.map((color, i) => (
        <span
          key={color}
          className="db-pop h-7 w-7 rounded-md"
          style={{
            background: `linear-gradient(135deg, ${color}, #0B1026 170%)`,
            animationDelay: `${i * 70}ms`,
          }}
        />
      ))}
    </div>
  );
}

export default function AuthScreen() {
  const profile = usePlayerStore(s => s.profile);
  const configured = usePlayerStore(s => s.configured);
  const signIn = usePlayerStore(s => s.signIn);
  const screenName = useAppStore(s => s.screenName);

  const [who, setWho] = useState<PlayerName | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // A restored Supabase session skips the auth screen.
  useEffect(() => {
    if (profile && screenName === 'auth') goScreen('home');
  }, [profile, screenName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function submit() {
    if (!who) {
      setError('Pick who you are first.');
      return;
    }
    setBusy(true);
    setError(null);
    const signedIn = await signIn(who, password);
    setBusy(false);
    if (signedIn) goScreen('home');
    else setError('Sign-in failed — double-check the password.');
  }

  function recover() {
    setToast('Password reset runs via Supabase email — configure the project first.');
  }

  return (
    <ScreenShell className="justify-center">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <LogoBlocks />
        <h1 className="bg-gradient-to-r from-[var(--db-violet)] via-[var(--db-cyan)] to-[var(--db-coral)] bg-clip-text text-4xl font-black tracking-wide text-transparent">
          DUO BLOCKS
        </h1>
        <p className="text-[0.62rem] font-black tracking-[0.28em] text-[var(--db-text-dim)]">
          TWO MINDS. ONE PUZZLE BATTLEFIELD.
        </p>
        <p className="text-xs font-bold text-[var(--db-text-dim)]">Cyril × Yayra</p>
      </div>

      {!configured && (
        <div className="rounded-[var(--db-radius)] border border-[var(--db-mint)]/40 bg-[var(--db-mint)]/10 px-4 py-3 text-center text-xs font-black text-[var(--db-mint)]">
          Local mode — connect Supabase later for multiplayer
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-[0.62rem] font-black tracking-[0.2em] text-[var(--db-text-dim)] uppercase">Who's playing?</p>
        <div className="grid grid-cols-2 gap-3">
          {(['Cyril', 'Yayra'] as PlayerName[]).map(name => {
            const selected = who === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setWho(name);
                  setError(null);
                }}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition active:scale-[0.97] ${
                  selected ? 'border-white/30 bg-white/10 ring-2 ring-[var(--db-violet)]/50' : 'border-white/10 bg-white/5 opacity-80'
                }`}
              >
                <PlayerAvatar name={name} size="lg" />
                <span className="text-xs font-black tracking-[0.18em] uppercase">{name}</span>
              </button>
            );
          })}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.62rem] font-black tracking-[0.2em] text-[var(--db-text-dim)] uppercase">Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder={configured ? '••••••••' : 'not needed in local mode'}
            autoComplete="current-password"
            className="rounded-xl border border-white/10 bg-[var(--db-bg-1)] px-4 py-3 text-sm text-[var(--db-text)] outline-none placeholder:text-[var(--db-text-dim)]/60 focus:border-[var(--db-violet)]/60"
          />
        </label>

        {error && <p className="text-xs font-bold text-[var(--db-coral)]">{error}</p>}

        <PrimaryButton tone="violet" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </PrimaryButton>

        <button
          type="button"
          onClick={recover}
          disabled={!configured}
          title={
            configured
              ? 'Send yourself a password-reset email'
              : 'Available after the Supabase project is configured'
          }
          className="text-[0.7rem] font-bold text-[var(--db-text-dim)] underline decoration-dotted underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Forgot password?
        </button>
      </div>

      {toast && <Toast message={toast} tone="info" />}
    </ScreenShell>
  );
}
