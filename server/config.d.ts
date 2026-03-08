export declare const config: {
  port: number;
  nodeEnv: string;
  frontendUrl: string;
  appDeepLinkScheme: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiry: string;
    refreshExpiry: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
  paddle: {
    apiKey: string;
    webhookSecret: string;
    priceIdBasic: string;
    priceIdPro: string;
  };
};
