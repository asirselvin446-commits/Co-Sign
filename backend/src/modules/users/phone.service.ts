import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { randomDigits, safeEqual } from '../../lib/crypto.js';
import { assertAsciiCode } from '../guardians/guardians.service.js';
import { ctxUserPhone } from './users.service.js';

const CODE_TTL = 600;
const MAX_ATTEMPTS = 5;
const key = (userId: string) => `phonecode:${userId}`;

const SMS_TEXT: Record<string, (code: string) => string> = {
  en: (c) => `Your Co-Sign code is ${c}. It expires in 10 minutes. Never share it with anyone, even if they say they are from your bank.`,
  ta: (c) => `உங்கள் Co-Sign குறியீடு ${c}. இது 10 நிமிடங்களில் காலாவதியாகும். வங்கியிலிருந்து பேசுவதாகச் சொன்னாலும் யாரிடமும் பகிர வேண்டாம்.`,
  hi: (c) => `आपका Co-Sign कोड ${c} है। यह 10 मिनट में खत्म हो जाएगा। कोई ख़ुद को बैंक से बताए, तब भी इसे किसी से साझा न करें।`,
};

/** Phone-number verification by SMS code (only when an SMS provider is configured). */
export class PhoneService {
  constructor(private readonly deps: Deps) {}

  async sendVerification(userId: string, phone: string): Promise<void> {
    const { redis, sms, prisma, limiter } = this.deps;
    await limiter.consume(`phone:send:${userId}`, 5, 3600);
    const code = randomDigits(6);
    await redis.set(key(userId), JSON.stringify({ hash: this.deps.blind.of('phone-code', code), phone, attempts: 0, expiresAt: Date.now() + CODE_TTL * 1000 }), 'EX', CODE_TTL * 3);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await sms.send(phone, (SMS_TEXT[user.locale] ?? SMS_TEXT.en!)(code));
  }

  async verify(userId: string, rawCode: string): Promise<void> {
    const { redis, prisma, blind, audit } = this.deps;
    const code = assertAsciiCode(rawCode);
    const raw = await redis.get(key(userId));
    if (!raw) throw new AppError('CODE_EXPIRED');
    const state = JSON.parse(raw) as { hash: string; phone: string; attempts: number; expiresAt: number };
    if (Date.now() > state.expiresAt) throw new AppError('CODE_EXPIRED');
    if (state.attempts >= MAX_ATTEMPTS) {
      throw new AppError('TOO_MANY_ATTEMPTS', {}, { retryAfterSeconds: Math.max(1, Math.ceil((state.expiresAt - Date.now()) / 1000)) });
    }
    if (!/^\d{6}$/.test(code) || !safeEqual(blind.of('phone-code', code), state.hash)) {
      state.attempts += 1;
      await redis.set(key(userId), JSON.stringify(state), 'KEEPTTL');
      throw new AppError('CODE_INVALID');
    }
    await redis.del(key(userId));
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Only mark verified if the number on file is still the one the code was sent to.
    if (!user.phoneEnc || this.deps.cipher.decrypt(user.phoneEnc, ctxUserPhone(userId)) !== state.phone) throw new AppError('CODE_EXPIRED');
    await prisma.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date() } });
    await audit.append({ actorType: 'user', actorId: userId, action: 'account.phone_verified', subjectType: 'user', subjectId: userId });
  }
}
