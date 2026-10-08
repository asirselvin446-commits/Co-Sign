import { useEffect, useState } from 'react';
import { api } from './api';
import { explain, type Explained } from './errors';

interface PageState<T> {
  path: string;
  items: T[];
  next: string | null;
  error: Explained | null;
}

/**
 * Keyset-paged GET list. Changing `path` (e.g. new filters) starts over; `loadMore` appends the
 * next page using the server's cursor, passed back as `cursorParam`.
 */
export function usePaged<T>(path: string, cursorParam: string, nextKey: string) {
  const [state, setState] = useState<PageState<T> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Record<string, unknown>>('GET', path).then(
      (page) => {
        if (!cancelled) setState({ path, items: page.items as T[], next: (page[nextKey] as string | null) ?? null, error: null });
      },
      (e: unknown) => {
        if (!cancelled) setState({ path, items: [], next: null, error: explain(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, nextKey]);

  async function loadMore() {
    if (!state?.next || state.path !== path) return;
    setLoadingMore(true);
    try {
      const sep = path.includes('?') ? '&' : '?';
      const page = await api<Record<string, unknown>>('GET', `${path}${sep}${cursorParam}=${encodeURIComponent(state.next)}`);
      setState((s) => s && { ...s, items: [...s.items, ...(page.items as T[])], next: (page[nextKey] as string | null) ?? null, error: null });
    } catch (e) {
      setState((s) => s && { ...s, error: explain(e) });
    } finally {
      setLoadingMore(false);
    }
  }

  const loading = state?.path !== path || loadingMore;
  return { items: state?.items ?? [], hasMore: !!state?.next && !loading, loading, error: state?.error ?? null, loadMore };
}
