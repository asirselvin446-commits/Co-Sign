import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { explain, type Explained } from './errors';

export interface ApiState<T> {
  data: T | undefined;
  error: Explained | null;
  loading: boolean;
  reload: () => void;
}

/** GET a resource and keep it in state. Pass null to skip. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Explained | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    api<T>('GET', path).then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(explain(e));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
