import { dispatchAnalyzeJobs } from '@/lib/analyze-job';
import { dispatchQueuedEmails } from '@/lib/email';
import { recoverExpiredServiceOperations } from '@/lib/service-operation';

export function startBackgroundWorker() {
  async function tick() {
    try {
      const results = await Promise.allSettled([dispatchAnalyzeJobs(1), dispatchQueuedEmails(), recoverExpiredServiceOperations()]);
      if (results.some(result => result.status === 'rejected')) console.error('[background-worker] work cycle failed');
    } finally {
      setTimeout(() => void tick(), 15_000).unref();
    }
  }

  setTimeout(() => void tick(), 1_000).unref();
}
