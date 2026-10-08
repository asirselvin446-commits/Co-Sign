import type { AddressInfo } from 'node:net';
import type { Server } from 'socket.io';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { closeDeps, createDeps, type Deps } from '../../src/deps.js';
import type { Ctx, ZApp } from '../../src/http/context.js';
import type { PushMessage, PushSender } from '../../src/modules/push/push.service.js';
import { attachRealtime } from '../../src/modules/realtime/socket.js';
import type { IntegrityVerdict, IntegrityVerifier } from '../../src/modules/risk/integrity.js';

/** Test double that records push messages instead of calling Firebase. */
export class RecordingPush implements PushSender {
  readonly enabled = true;
  readonly sent: Array<{ userId: string; message: PushMessage }> = [];
  async sendToUser(userId: string, build: (lang: string) => PushMessage): Promise<number> {
    this.sent.push({ userId, message: build('en') });
    return 1;
  }
  forUser(userId: string): PushMessage[] {
    return this.sent.filter((s) => s.userId === userId).map((s) => s.message);
  }
}

/** Test double for Play Integrity: returns whatever verdict the test sets. */
export class StubIntegrity implements IntegrityVerifier {
  readonly enabled = true;
  verdict: IntegrityVerdict = { status: 'pass', reasons: [] };
  async verify(): Promise<IntegrityVerdict> {
    return this.verdict;
  }
}

export interface TestApp {
  app: ZApp;
  ctx: Ctx;
  deps: Deps;
  io: Server;
  url: string;
  push: RecordingPush;
  integrity: StubIntegrity;
  close: () => Promise<void>;
}

export async function startTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const config = loadConfig({ ...process.env, ...env });
  const push = new RecordingPush();
  const integrity = new StubIntegrity();
  const deps = await createDeps(config, { push, integrity });
  const { app, ctx } = await buildApp(deps, { swaggerUi: false });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const io = await attachRealtime(app.server, ctx);
  const { port } = app.server.address() as AddressInfo;
  return {
    app,
    ctx,
    deps,
    io,
    url: `http://127.0.0.1:${port}`,
    push,
    integrity,
    close: async () => {
      await new Promise<void>((r) => io.close(() => r()));
      await app.close();
      await closeDeps(deps);
    },
  };
}
