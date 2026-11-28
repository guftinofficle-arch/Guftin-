export function getMagicMomentCountdown(revealAt, now = Date.now()) {
  const target = typeof revealAt === 'number' ? revealAt : Date.parse(String(revealAt || ''));
  if (!Number.isFinite(target) || !Number.isFinite(now)) return null;

  const remainingSeconds = target <= now ? 0 : Math.ceil((target - now) / 1000);
  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  return {
    isReady: target <= now,
    days,
    hours,
    minutes,
    seconds
  };
}
