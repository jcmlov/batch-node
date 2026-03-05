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
    timezone: "Asia/Seoul",
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
  // 🔥 PlayAuto 추가
  playauto: {
    apiKey: process.env.PLAYAUTO_API_KEY,
    userId: process.env.PLAYAUTO_USER_ID,
    password: process.env.PLAYAUTO_PASSWORD,
    tokenUrl: process.env.PLAYAUTO_TOKEN_URL,
    depotUrl: process.env.PLAYAUTO_DEPOT_URL,
    stockListUrl: process.env.PLAYAUTO_STOCK_LIST_URL,
    skuAddUrl: process.env.PLAYAUTO_SKU_ADD_URL,
    skuEditUrl: process.env.PLAYAUTO_SKU_EDIT_URL,
    stockCondUrl: process.env.PLAYAUTO_STOCK_COND_URL,
    stockManageUrl: process.env.PLAYAUTO_STOCK_MANAGE_URL,
    baseUrl: process.env.PLAYAUTO_BASE_URL, // 🔥 추가 권장
    timeout: Number(process.env.PLAYAUTO_TIMEOUT || 10000),
  },
  cron: {
    // shopping rank
    morning: process.env.BATCH_CRON_MORNING,
    afternoon: process.env.BATCH_CRON_AFTERNOON,
    // ecount
    ecountErp: process.env.BATCH_CRON_ECOUNT_ERP,
    // 🔥 inventory
    ecountTodayInventory: process.env.BATCH_CRON_ECOUNT_TODAY_INVENTORY,
    inventory: process.env.BATCH_CRON_INVENTORY_TEN,
    yesterdayInventory: process.env.BATCH_CRON_YESTERDAY_INVENTORY,

    // 🔥 playauto
    playautoDepot: process.env.BATCH_CRON_PLAYAUTO_DPT,
    playautoSkuList: process.env.BATCH_CRON_PLAYAUTO_SKU_LIST,
    playautoSkuPrice: process.env.BATCH_CRON_PLAYAUTO_SKU_PRICE,
    playautoStockCond: process.env.BATCH_CRON_PLAYAUTO_STOCK_COND,
    playautoStockManage: process.env.BATCH_CRON_PLAYAUTO_STOCK_MANAGE,
  },
};
