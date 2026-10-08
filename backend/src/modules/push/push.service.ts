import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { App } from 'firebase-admin/app';
import type { Messaging } from 'firebase-admin/messaging';
import type { FieldCipher } from '../../lib/crypto.js';

export interface PushMessage {
  /** Routing type understood by the mobile app, e.g. "guardian_request". */
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PushSender {
  readonly enabled: boolean;
  sendToUser(userId: string, message: (lang: string) => PushMessage, opts?: { excludeDeviceId?: string }): Promise<number>;
}

export const pushTokenContext = (deviceId: string) => `device.push:${deviceId}`;

/**
 * Firebase Cloud Messaging sender. Android receives data-only, high-priority messages so the app's
 * background handler can open the approval screen; iOS receives an alert plus the same data.
 */
export class FcmPushSender implements PushSender {
  readonly enabled: boolean;
  private messaging: Messaging | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: FieldCipher,
    private readonly log: Logger,
    private readonly serviceAccountB64: string,
  ) {
    this.enabled = serviceAccountB64.length > 0;
  }

  private async client(): Promise<Messaging | null> {
    if (!this.enabled) return null;
    if (this.messaging) return this.messaging;
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const sa = JSON.parse(Buffer.from(this.serviceAccountB64, 'base64').toString('utf8'));
    const app: App = getApps().find((a) => a.name === 'cosign') ?? initializeApp({ credential: cert(sa) }, 'cosign');
    this.messaging = getMessaging(app);
    return this.messaging;
  }

  async sendToUser(
    userId: string,
    build: (lang: string) => PushMessage,
    opts: { excludeDeviceId?: string } = {},
  ): Promise<number> {
    const messaging = await this.client();
    if (!messaging) return 0;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true, devices: { where: { revokedAt: null, pushTokenEnc: { not: null } } } },
    });
    if (!user) return 0;
    let sent = 0;
    for (const device of user.devices) {
      if (device.id === opts.excludeDeviceId) continue;
      let token: string;
      try {
        token = this.cipher.decrypt(device.pushTokenEnc!, pushTokenContext(device.id));
      } catch {
        continue;
      }
      const msg = build(user.locale);
      const data = { ...msg.data, type: msg.type, title: msg.title, body: msg.body };
      try {
        await messaging.send({
          token,
          data,
          android: { priority: 'high', ttl: 10 * 60 * 1000 },
          apns: {
            headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
            payload: { aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', 'content-available': 1 } },
          },
        });
        sent++;
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          await this.prisma.device.update({ where: { id: device.id }, data: { pushTokenEnc: null } });
        } else {
          this.log.warn({ err: e, deviceId: device.id }, 'push send failed');
        }
      }
    }
    return sent;
  }
}
