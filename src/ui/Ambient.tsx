import { AmbientLife } from './AmbientLife';

/**
 * The page behind the app: a still ledger (khata) sheet - faint rules, a double margin line, paper grain.
 * With "Background life" on (Settings → General), a small line-art scene now and then drifts across it.
 */
export function Ambient({ life = true }: { life?: boolean }) {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ledger" />
      <div className="grain" />
      {life && <AmbientLife />}
    </div>
  );
}
