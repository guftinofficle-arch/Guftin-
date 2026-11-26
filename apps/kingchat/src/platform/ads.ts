export const BannerAd = (_props: any) => null;
export const BannerAdSize = { BANNER: 'BANNER' } as const;
export const MaxAdContentRating = { G: 'G' } as const;
export const TestIds = { BANNER: 'web-no-ad' } as const;
const mobileAds = () => ({ setRequestConfiguration: async (_config: any) => undefined, initialize: async () => undefined });
export default mobileAds;
