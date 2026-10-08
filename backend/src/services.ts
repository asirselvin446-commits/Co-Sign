import type { Deps } from './deps.js';
import { TokenService } from './modules/auth/tokens.js';

export interface Services {
  tokens: TokenService;
}

export function createServices(deps: Deps): Services {
  const tokens = new TokenService(deps);
  return { tokens };
}
