import type { Deps } from './deps.js';
import { CredentialsService } from './modules/auth/credentials.service.js';
import { TokenService } from './modules/auth/tokens.js';
import { DevicesService } from './modules/devices/devices.service.js';
import { GuardiansService } from './modules/guardians/guardians.service.js';
import { MonitorService } from './modules/monitor/monitor.service.js';
import { PrivacyService } from './modules/privacy/privacy.service.js';
import { Notifier } from './modules/push/notifier.js';
import { RecoveryService } from './modules/recovery/recovery.service.js';
import { RiskService } from './modules/risk/risk.service.js';
import { SigninService } from './modules/signin/signin.service.js';
import { createActions } from './modules/stepup/actions.js';
import { StepupService } from './modules/stepup/stepup.service.js';
import { PhoneService } from './modules/users/phone.service.js';
import { UsersService } from './modules/users/users.service.js';
import { WebAuthnService } from './modules/webauthn/webauthn.service.js';

export interface Services {
  tokens: TokenService;
  webauthn: WebAuthnService;
  users: UsersService;
  credentials: CredentialsService;
  devices: DevicesService;
  notifier: Notifier;
  risk: RiskService;
  guardians: GuardiansService;
  phone: PhoneService;
  privacy: PrivacyService;
  stepup: StepupService;
  recovery: RecoveryService;
  monitor: MonitorService;
  signin: SigninService;
}

export function createServices(deps: Deps): Services {
  const tokens = new TokenService(deps);
  const webauthn = new WebAuthnService(deps);
  const users = new UsersService(deps);
  const credentials = new CredentialsService(deps, webauthn);
  const devices = new DevicesService(deps, tokens);
  const notifier = new Notifier(deps);
  const risk = new RiskService(deps, credentials);
  const guardians = new GuardiansService(deps, users, notifier);
  const phone = new PhoneService(deps);
  const privacy = new PrivacyService(deps, devices);

  // Step-up and recovery depend on the full set (actions call into guardians, privacy...).
  const services = { tokens, webauthn, users, credentials, devices, notifier, risk, guardians, phone, privacy } as Services;
  services.stepup = new StepupService(deps, services, createActions(deps, services));
  services.recovery = new RecoveryService(deps, services);
  services.monitor = new MonitorService(deps, services);
  services.signin = new SigninService(deps, services);
  return services;
}
