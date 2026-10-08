import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { currentToken, refreshSession } from './api';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      transports: ['websocket'],
      auth: (cb) => cb({ token: currentToken() }),
      reconnectionDelayMax: 10_000,
    });
    socket.on('connect_error', () => {
      // Token may have expired: refresh, then socket.io retries with the new token.
      void refreshSession();
    });
  }
  return socket;
}

export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Subscribe to a realtime event for the lifetime of the component. */
export function useRealtime<T>(event: string, handler: (payload: T) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  }, [handler]);
  useEffect(() => {
    const s = getSocket();
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event]);
}
