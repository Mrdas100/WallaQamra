process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/loyalty_test";
process.env.WALLET_SYNC_INLINE = "off";
process.env.API_RATE_LIMIT_PER_MINUTE = "100000";
process.env.APP_URL = "https://loyalty.test";
process.env.APPLE_PASS_TYPE_ID = "pass.test.shahiqamra";
