import type { Deps } from '../../deps.js';
import { ACTION_LABELS, NOTIFICATIONS, TERMS, type ActionKey, type Lang, type NotificationKey } from '../../generated/catalog.js';
import { formatClock, pickLang } from '../../lib/errors.js';

export type Vars = Record<string, string>;

const fill = (t: string, vars: Vars) => t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

/**
 * Sends localised push notifications (FCM) plus a realtime event. The text comes from the shared
 * catalogue in each recipient's own language; the data payload tells the app which screen to open.
 */
export class Notifier {
  constructor(private readonly deps: Deps) {}

  actionLabel(action: string, lang: Lang): string {
    return ACTION_LABELS[action as ActionKey]?.[lang] ?? action;
  }

  term(key: keyof typeof TERMS, lang: Lang): string {
    return TERMS[key][lang];
  }

  clock(iso: string, lang: Lang): string {
    return formatClock(iso, lang, this.deps.config.DISPLAY_TIMEZONE);
  }

  async push(
    userId: string,
    key: NotificationKey,
    vars: (lang: Lang) => Vars,
    data: Record<string, string>,
    opts: { excludeDeviceId?: string } = {},
  ): Promise<void> {
    try {
      await this.deps.push.sendToUser(
        userId,
        (rawLang) => {
          const lang = pickLang(rawLang);
          const t = NOTIFICATIONS[key][lang];
          const v = vars(lang);
          return { type: key, title: fill(t.title, v), body: fill(t.body, v), data };
        },
        opts,
      );
    } catch (err) {
      this.deps.log.warn({ err, key }, 'push notification failed');
    }
  }
}
