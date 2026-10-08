import catalog from '../../shared/catalog.json';
import { ApiError } from './api';

export interface Explained {
  code: string;
  cause: string;
  next: string;
}

type Entry = { en: { cause: string; next: string } };
const errors = catalog.errors as Record<string, Entry>;

function fromCatalog(code: string): Explained {
  const e = errors[code] ?? errors.INTERNAL_ERROR!;
  return { code, cause: e.en.cause, next: e.en.next };
}

/** Turn any failure (API, WebAuthn DOMException, network) into one cause and one next step. */
export function explain(err: unknown): Explained {
  if (err instanceof ApiError) return { code: err.body.code, cause: err.body.cause, next: err.body.next };
  if (err instanceof DOMException || (err instanceof Error && 'name' in err)) {
    const name = (err as Error).name;
    const code = (err as { code?: string }).code;
    if (code === 'ERROR_CEREMONY_ABORTED' || name === 'AbortError') return fromCatalog('PASSKEY_CANCELLED');
    if (name === 'NotAllowedError') return fromCatalog('PASSKEY_CANCELLED');
    if (name === 'InvalidStateError') return fromCatalog('CREDENTIAL_ALREADY_REGISTERED');
    if (name === 'NotSupportedError') return fromCatalog('PASSKEY_UNSUPPORTED');
    if (name === 'SecurityError') return fromCatalog('NOT_ALLOWED');
    if (name === 'TypeError') return fromCatalog('NETWORK_ERROR');
  }
  return fromCatalog('INTERNAL_ERROR');
}
