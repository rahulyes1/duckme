import { Home } from 'lucide-react';

/** Jump straight to Home from anywhere (editors, sheets). App listens for `hisaab:home`. */
export const goHome = () => window.dispatchEvent(new Event('hisaab:home'));

export function HomeButton() {
  return (
    <button type="button" className="icon-btn" aria-label="Go to Home" onClick={goHome}>
      <Home size={20} aria-hidden="true" />
    </button>
  );
}
