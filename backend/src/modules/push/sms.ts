import type { Logger } from 'pino';

export interface SmsSender {
  readonly enabled: boolean;
  send(toE164: string, text: string): Promise<boolean>;
}

export class DisabledSmsSender implements SmsSender {
  readonly enabled = false;
  async send(): Promise<boolean> {
    return false;
  }
}

/** Minimal Twilio Messages API client (no SDK needed). */
export class TwilioSmsSender implements SmsSender {
  readonly enabled = true;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
    private readonly log: Logger,
  ) {}

  async send(toE164: string, text: string): Promise<boolean> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toE164, From: this.from, Body: text }),
      signal: AbortSignal.timeout(8000),
    }).catch((err: unknown) => {
      this.log.warn({ err }, 'sms send failed');
      return null;
    });
    if (!res?.ok) {
      if (res) this.log.warn({ status: res.status }, 'sms send rejected');
      return false;
    }
    return true;
  }
}
