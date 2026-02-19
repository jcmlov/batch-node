const path = require("path");
const dotenv = require("dotenv");

const env = process.env.NODE_ENV || "local";

dotenv.config({
  path: path.resolve(process.cwd(), `.env.${env}`),
});

module.exports = {
  env,
  port: process.env.PORT || 8082,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    pool: {
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT || 300000),
      connectionTimeoutMillis: Number(process.env.DB_CONN_TIMEOUT || 30000),
    },
  },
  batch: {
    enabled: process.env.BATCH_ENABLED === "true",
  },
  naver: {
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
  },
  ecount: {
    companyId: process.env.ECOUNT_COMPANY_ID,
    userId: process.env.ECOUNT_USER_ID,
    apiCertKey: process.env.ECOUNT_API_CERT_KEY,
  },
  cron: {
    // shopping rank
    morning: process.env.BATCH_CRON_MORNING,
    afternoon: process.env.BATCH_CRON_AFTERNOON,
    // ecount
    ecountErp: process.env.BATCH_CRON_ECOUNT_ERP,
    // 🔥 inventory
    inventory: process.env.BATCH_CRON_INVENTORY,
    yesterdayInventory: process.env.BATCH_CRON_YESTERDAY_INVENTORY,
  },
};
