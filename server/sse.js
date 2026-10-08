// Server-Sent Events hub: named channels, each a set of open responses.
const channels = new Map();

export function subscribe(req, res, names) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  for (const name of names) {
    if (!channels.has(name)) channels.set(name, new Set());
    channels.get(name).add(res);
  }
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    for (const name of names) channels.get(name)?.delete(res);
  });
}

export function publish(name, event, data) {
  const subs = channels.get(name);
  if (!subs) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) res.write(payload);
}
