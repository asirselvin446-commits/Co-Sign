import type { Ctx } from '../http/context.js';

export interface Job {
  name: string;
  /** Must be safe to run concurrently on several instances (conditional updates / SKIP LOCKED). */
  run: (ctx: Ctx) => Promise<void>;
}

export const jobs: Job[] = [];

/** Runs every job on a fixed interval. Returns a stop function. */
export function startJobs(ctx: Ctx, list: Job[] = jobs): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const job of list) {
        try {
          await job.run(ctx);
        } catch (err) {
          ctx.deps.log.error({ err, job: job.name }, 'job failed');
        }
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), ctx.deps.config.JOB_INTERVAL_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
