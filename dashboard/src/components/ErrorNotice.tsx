import type { Explained } from '../errors';

/** One cause and one next step, announced to screen readers. */
export function ErrorNotice({ error }: { error: Explained | null }) {
  if (!error) return null;
  return (
    <div className="alert" role="alert">
      <strong>{error.cause}</strong>
      <span>{error.next}</span>
    </div>
  );
}
