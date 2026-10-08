import type { Deps } from './deps.js';
import { CredentialsService } from './modules/auth/credentials.service.js';
import { TokenService } from './modules/auth/tokens.js';
import { DevicesService } from './modules/devices/devices.service.js';
import { Notifier } from './modules/push/notifier.js';
import { UsersService } from './modules/users/users.service.js';
import { WebAuthnService } from './modules/webauthn/webauthn.service.js';

export interface Services {
  tokens: TokenService;
  webauthn: WebAuthnService;
  users: UsersService;
  credentials: CredentialsService;
  devices: DevicesService;
  notifier: Notifier;
}

export function createServices(deps: Deps): Services {
  const tokens = new TokenService(deps);
  const webauthn = new WebAuthnService(deps);
  const users = new UsersService(deps);
  const credentials = new CredentialsService(deps, webauthn);
  const devices = new DevicesService(deps, tokens);
  const notifier = new Notifier(deps);
  return { tokens, webauthn, users, credentials, devices, notifier };
}
