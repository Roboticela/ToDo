export declare const config: {
  port: number;
  nodeEnv: string;
  frontendUrl: string;
  backendUrl: string;
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
  email: {
    subscriptionReminderIntervalDays: number;
    unsubscribeSecret: string;
  };
  paddle: {
    apiKey: string;
    webhookSecret: string;
    priceIdBasic: string;
    priceIdPro: string;
  };
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicUrl: string;
  };
};
