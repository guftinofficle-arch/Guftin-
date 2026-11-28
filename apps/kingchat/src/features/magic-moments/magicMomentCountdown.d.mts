export interface MagicMomentCountdown {
  isReady: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}
export declare function getMagicMomentCountdown(revealAt: string | number | null | undefined, now?: number): MagicMomentCountdown | null;
