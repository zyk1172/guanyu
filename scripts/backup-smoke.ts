import assert from 'node:assert/strict';
import { decodeOperationsBackup, encodeOperationsBackup, type OperationsBackupSnapshot } from '../lib/operations-backup';

const snapshot: OperationsBackupSnapshot = {
  format: 'GUANYU_OPERATIONS_BACKUP',
  version: 1,
  createdAt: new Date('2026-07-18T00:00:00.000Z').toISOString(),
  notes: ['test'],
  counts: { users: 1, audits: 1, savedArticles: 1 },
  tables: {
    appSettings: [], users: [{ id: 'user_1', email: 'admin@example.com', password: 'scrypt$hash' }], userSettings: [], audits: [{ id: 'audit_1', userId: 'user_1', title: 'Test' }], pointTransactions: [], purchaseOrders: [], rssFeeds: [], rssItems: [], discussionMessages: [], discussionReports: [], exportArtifacts: [], emailDeliveries: [], savedArticles: [{ id: 'saved_1', userId: 'user_1', title: 'Saved', source: 'example', url: 'https://example.com', content: 'text' }],
  },
  portableSecrets: { appSettings: [], userSettings: [] },
};

const passphrase = 'a backup passphrase with enough entropy';
const archive = encodeOperationsBackup(snapshot, passphrase);
assert.equal(archive.includes(Buffer.from('scrypt$hash')), false, 'backup archive must be encrypted');
assert.deepEqual(decodeOperationsBackup(archive, passphrase).tables.users, snapshot.tables.users);
assert.throws(() => decodeOperationsBackup(archive, 'incorrect backup passphrase'), /口令不正确/);
console.log(`operations backup smoke passed: ${archive.byteLength} bytes`);
