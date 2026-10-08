import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Ctx } from '../../http/context.js';
import { DASHBOARD_ROOM, deviceRoom, userRoom } from './hub.js';

/**
 * Socket.io with the Redis adapter. Clients authenticate with the same access token as the REST API:
 * users join their user and device rooms, staff join the dashboard feed.
 */
export async function attachRealtime(server: HttpServer, ctx: Ctx): Promise<Server> {
  const { deps, services } = ctx;
  const pub = deps.redis.duplicate();
  const sub = deps.redis.duplicate();
  const io = new Server(server, {
    path: '/socket.io',
    serveClient: false,
    cors: { origin: deps.config.CORS_ORIGINS, credentials: true },
    adapter: createAdapter(pub, sub, { key: 'cosign-io' }),
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null;
    if (!token) return next(new Error('SESSION_EXPIRED'));
    try {
      const user = await services.tokens.verifyUser(token);
      socket.data.kind = 'user';
      socket.data.userId = user.sub;
      socket.data.deviceId = user.did;
      return next();
    } catch {
      // fall through to admin
    }
    try {
      const admin = await services.tokens.verifyAdmin(token);
      socket.data.kind = 'admin';
      socket.data.adminId = admin.sub;
      return next();
    } catch {
      return next(new Error('SESSION_EXPIRED'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.data.kind === 'user') {
      void socket.join([userRoom(socket.data.userId), deviceRoom(socket.data.deviceId)]);
    } else if (socket.data.kind === 'admin') {
      void socket.join(DASHBOARD_ROOM);
    }
  });

  io.engine.on('connection_error', (err: { code: number; message: string }) => {
    deps.log.debug({ code: err.code, message: err.message }, 'socket connection error');
  });

  deps.realtime.attach(io);
  return io;
}
