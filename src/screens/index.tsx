/**
 * DUO BLOCKS — screen wiring & router.
 * Owns the screen-element registry: on mount it hydrates the player store
 * ONCE, registers the default screen (auth when there is no profile, home
 * otherwise) into the app store, and renders whatever element the app store
 * currently holds. Pages navigate themselves by calling goScreen(name).
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../store/appStore';
import type { ScreenName } from '../store/appStore';
import { usePlayerStore } from '../store/playerStore';
import { audio } from '../features/game/audio/audioEngine';
import AuthScreen from '../pages/AuthScreen';
import HomeScreen from '../pages/HomeScreen';
import CampaignScreen from '../pages/CampaignScreen';
import GameScreen from '../pages/GameScreen';
import LeaderboardScreen from '../pages/LeaderboardScreen';
import ProfileScreen from '../pages/ProfileScreen';
import ChallengesScreen from '../pages/ChallengesScreen';
import DuelScreen from '../pages/DuelScreen';
import { UpdateToast } from '../pwa/UpdateToast';

/** Every route's element; pages reach them via goScreen(). */
const SCREEN_ELEMENTS: Record<ScreenName, ReactNode> = {
  auth: <AuthScreen />,
  home: <HomeScreen />,
  campaign: <CampaignScreen />,
  game: <GameScreen />,
  leaderboard: <LeaderboardScreen />,
  profile: <ProfileScreen />,
  challenges: <ChallengesScreen />,
  duel: <DuelScreen />,
};

/** Navigate by screen name — pages call this from their own buttons. */
export function goScreen(name: ScreenName) {
  useAppStore.getState().navigate(name, SCREEN_ELEMENTS[name]);
}

let hydrateStarted = false;

/** Hydrate the player store exactly once per app lifetime (StrictMode-safe). */
function hydrateOnce() {
  if (hydrateStarted) return;
  hydrateStarted = true;
  void usePlayerStore.getState().hydrate();
}

/** Auto-switcher: registers the default screen and renders the current one. */
export function AppScreens() {
  const screen = useAppStore(s => s.screen);
  const screenName = useAppStore(s => s.screenName);

  useEffect(() => {
    hydrateOnce();
    const app = useAppStore.getState();
    if (!app.screen) {
      const initial: ScreenName = usePlayerStore.getState().profile ? 'home' : 'auth';
      app.navigate(initial, SCREEN_ELEMENTS[initial]);
    }
    // Music resumes on the dashboard even when the user is already signed in
    // (app reload / PWA reopen). Browsers need a gesture first, so we try
    // immediately and arm a first-tap fallback for locked-down cases.
    if (usePlayerStore.getState().profile) {
      audio.startMusic();
      audio.armAutoplay();
    }
    const unsub = usePlayerStore.subscribe((state) => {
      if (state.profile) audio.armAutoplay();
    });
    return () => { unsub(); };
  }, []);

  // Keep the rendered element in sync even when a page navigates bare —
  // e.g. GameScreen's exit calls navigate('home') without an element
  // (appStore keeps the previous element in that case).
  const currentElement = SCREEN_ELEMENTS[screenName];
  useEffect(() => {
    const app = useAppStore.getState();
    if (app.screen !== currentElement) {
      app.navigate(screenName, currentElement);
    }
  }, [screenName, currentElement]);

  return (
    <div className="min-h-screen db-no-select">
      {screen ?? SCREEN_ELEMENTS[screenName] ?? <AuthScreen />}
      <UpdateToast />
    </div>
  );
}

export default AppScreens;
