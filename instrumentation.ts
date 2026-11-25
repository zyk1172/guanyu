export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.GUANYU_BACKGROUND_WORKER !== 'true') return;
    const { startBackgroundWorker } = await import('./lib/background-worker');
    startBackgroundWorker();
  }
}
