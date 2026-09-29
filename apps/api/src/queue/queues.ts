/** Queue categories (spec §25.1). */
export const QUEUES = {
  webhookProcessing: 'webhook-processing',
  reconciliation: 'reconciliation',
  notifications: 'notifications',
  email: 'email',
  analyticsAggregation: 'analytics-aggregation',
  socialSync: 'social-sync',
  payoutProcessing: 'payout-processing',
  deadLetter: 'dead-letter',
  fraudScoring: 'fraud-scoring',
  cleanupRetention: 'cleanup-retention',
  reportExport: 'report-export',
  outbox: 'outbox-dispatch',
  scheduler: 'scheduler',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Default retry/backoff per queue (spec §25.2); poison jobs end up in the dead-letter queue. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 10_000 },
  removeOnFail: false,
};
