/** Status expiry helpers shared by Updates and cached status loading. */
export function isStatusActive(status: { expires_at?: string | null }, now = Date.now()): boolean {
  if (!status.expires_at) return true;
  const expiry = new Date(status.expires_at).getTime();
  return Number.isFinite(expiry) && expiry > now;
}

export function getStatusProgress(createdAt: string, expiresAt: string, now = Date.now()): number {
  const start = new Date(createdAt).getTime();
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}
