import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldScheduleAnalyzeJobRecovery } from '../lib/analyze-job-core.mjs';
import {
  ANALYSIS_JOB_POLLING_ATTEMPTS,
  getAnalysisJobPollingDelay,
} from '../lib/analysis-job-client-core.mjs';

const now = new Date('2026-08-22T00:00:00.000Z');

test('schedules only due pending or expired running job recovery', () => {
  assert.equal(shouldScheduleAnalyzeJobRecovery({ status: 'pending', nextAttemptAt: null, now }), true);
  assert.equal(shouldScheduleAnalyzeJobRecovery({ status: 'pending', nextAttemptAt: new Date('2026-08-21T23:59:59.000Z'), now }), true);
  assert.equal(shouldScheduleAnalyzeJobRecovery({ status: 'pending', nextAttemptAt: new Date('2026-08-22T00:00:01.000Z'), now }), false);
  assert.equal(shouldScheduleAnalyzeJobRecovery({ status: 'running', leaseExpiresAt: new Date('2026-08-21T23:59:59.000Z'), now }), true);
  assert.equal(shouldScheduleAnalyzeJobRecovery({ status: 'running', leaseExpiresAt: new Date('2026-08-22T00:00:01.000Z'), now }), false);
  assert.equal(shouldScheduleAnalyzeJobRecovery({ status: 'running', leaseExpiresAt: null, now }), false);
  assert.equal(shouldScheduleAnalyzeJobRecovery({ status: 'completed', now }), false);
  assert.equal(shouldScheduleAnalyzeJobRecovery({ status: 'failed', now }), false);
});

test('uses restrained polling delays and an approximately twelve-minute deadline', () => {
  assert.equal(getAnalysisJobPollingDelay(0), 2000);
  assert.equal(getAnalysisJobPollingDelay(4), 2000);
  assert.equal(getAnalysisJobPollingDelay(5), 5000);
  assert.equal(getAnalysisJobPollingDelay(144), 5000);
  assert.equal(ANALYSIS_JOB_POLLING_ATTEMPTS, 145);
  assert.equal((5 * 2000) + (140 * 5000), 710000);
});
