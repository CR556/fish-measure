import { getDb } from './database';

export type QueueRow = {
  catchId: string;
  enqueuedAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  lastError: string | null;
};

export function enqueueId(catchId: string): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO id_queue (catch_id, enqueued_at, attempts, last_attempt_at, last_error)
     VALUES (?, ?, 0, NULL, NULL)`,
    [catchId, Date.now()]
  );
}

export function dequeueId(catchId: string): void {
  getDb().runSync('DELETE FROM id_queue WHERE catch_id = ?', [catchId]);
}

export function markAttempt(catchId: string, error: string | null): void {
  getDb().runSync(
    'UPDATE id_queue SET attempts = attempts + 1, last_attempt_at = ?, last_error = ? WHERE catch_id = ?',
    [Date.now(), error, catchId]
  );
}

export function listQueue(): QueueRow[] {
  const rows = getDb().getAllSync<{
    catch_id: string;
    enqueued_at: number;
    attempts: number;
    last_attempt_at: number | null;
    last_error: string | null;
  }>('SELECT * FROM id_queue ORDER BY enqueued_at ASC');
  return rows.map((r) => ({
    catchId: r.catch_id,
    enqueuedAt: r.enqueued_at,
    attempts: r.attempts,
    lastAttemptAt: r.last_attempt_at,
    lastError: r.last_error,
  }));
}

export function isQueued(catchId: string): boolean {
  const row = getDb().getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM id_queue WHERE catch_id = ?',
    [catchId]
  );
  return (row?.n ?? 0) > 0;
}
