import { AppScreens } from './screens';

/**
 * DUO BLOCKS app shell.
 * The UI-shell workstream owns the screens; this simply renders the
 * store-driven screen switcher (see src/screens/index.tsx).
 */
export default function App() {
  return <AppScreens />;
}
