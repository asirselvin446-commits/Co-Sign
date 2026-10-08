import type { Ctx } from '../http/context.js';

export interface Job {
  name: string;
  /** Minimum time between runs of this job. */
  everyMs: number;
  /** Must be safe to run concurrently on several instances (conditional updates). */
  run: (ctx: Ctx) => Promise<unknown>;
}

export const jobs: Job[] = [
  { name: 'stepup-timers', everyMs: 0, run: (c) => c.services.stepup.runTimers() },
  { name: 'recovery-timers', everyMs: 0, run: (c) => c.services.recovery.runTimers() },
  { name: 'guardian-changes', everyMs: 0, run: (c) => c.services.guardians.applyDueChanges() },
  { name: 'signal-retention', everyMs: 3600_000, run: (c) => c.services.privacy.purgeExpiredSignals() },
];

/** Runs every job on a fixed tick (JOB_INTERVAL_MS). Returns a stop function. */
export function startJobs(ctx: Ctx, list: Job[] = jobs): () => void {
  let running = false;
  const lastRun = new Map<string, number>();
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const job of list) {
        const last = lastRun.get(job.name) ?? 0;
        if (Date.now() - last < job.everyMs) continue;
        lastRun.set(job.name, Date.now());
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

/** Run every job once, in order (used by tests and the admin "run timers" maintenance hook). */
export async function runJobsOnce(ctx: Ctx, list: Job[] = jobs): Promise<void> {
  for (const job of list) await job.run(ctx);
}
