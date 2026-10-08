import type { Server } from 'socket.io';

export const userRoom = (userId: string) => `user:${userId}`;
export const deviceRoom = (deviceId: string) => `device:${deviceId}`;
export const DASHBOARD_ROOM = 'dashboard';

/**
 * Thin facade over Socket.io so services can emit before the server is attached (e.g. in jobs and
 * tests). With the Redis adapter, emits reach sockets connected to any backend instance.
 */
export class RealtimeHub {
  private io: Server | null = null;

  attach(io: Server): void {
    this.io = io;
  }

  get server(): Server | null {
    return this.io;
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.io?.to(userRoom(userId)).emit(event, payload);
  }

  toDevice(deviceId: string, event: string, payload: unknown): void {
    this.io?.to(deviceRoom(deviceId)).emit(event, payload);
  }

  toDashboard(event: string, payload: unknown): void {
    this.io?.to(DASHBOARD_ROOM).emit(event, payload);
  }

  /** Force-disconnect every socket of a device (used when a device is revoked). */
  disconnectDevice(deviceId: string): void {
    this.io?.in(deviceRoom(deviceId)).disconnectSockets(true);
  }
}
