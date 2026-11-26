/**
 * The page behind the app: a still ledger (khata) sheet - faint rules, a double margin line, paper grain.
 * Deliberately motionless; this cycle's money line lives in the Today card on Home.
 */
export function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ledger" />
      <div className="grain" />
    </div>
  );
}
