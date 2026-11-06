import { create } from 'zustand';

export type ScreenName =
  | 'auth'
  | 'home'
  | 'campaign'
  | 'game'
  | 'leaderboard'
  | 'profile'
  | 'challenges'
  | 'duel';

export interface AppState {
  screen: React.ReactNode; // rendered screen element
  screenName: ScreenName; // for navigation bookkeeping
  navigate: (name: ScreenName, element?: React.ReactNode) => void;
}

/**
 * Lightweight screen router. Screens register themselves by calling
 * navigate(name, <ScreenElement/>). The UI-shell workstream wires this.
 */
export const useAppStore = create<AppState>(set => ({
  screen: null,
  screenName: 'auth',
  navigate: (screenName, element) =>
    set(state => ({ screenName, screen: element ?? state.screen })),
}));
