const express = require("express");
const config = require("./config");
const shoppingRankCron = require("./scheduler/shoppingRank.cron");
const ecountProductCron = require("./scheduler/ecountErpProduct.cron");
const ecountInventoryCron = require("./scheduler/ecountErpInventory.cron");
const shoppingRankJob = require("./batch/jobs/shoppingRank.job");
const ecountProductJob = require("./batch/jobs/ecountErpProduct.job");
const ecountInventoryJob = require("./batch/jobs/ecountErpInventory.job");

const app = express();
app.use(express.json());

// ========================
// API Endpoints
// ========================

// 쇼핑 랭크 배치 (기존)
app.post("/batch/run", async (req, res) => {
  try {
    const result = await shoppingRankJob.run();
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 이카운트 상품 배치 (수동)
app.post("/api/ecount/product/batch/run", async (req, res) => {
  try {
    const result = await ecountProductJob.run("MANUAL");
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ✅ 이카운트 재고 배치 (수동) ← 추가됨
app.post("/api/ecount/inventory/batch/run", async (req, res) => {
  try {
    const { type } = req.body;
    // type 예:
    // - "MANUAL"
    // - "YESTERDAY_INVENTORY"

    const result = await ecountInventoryJob.run(type || "MANUAL");

    res.json({
      success: true,
      type: type || "MANUAL",
      result,
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
});

// ========================
// Start Server & Cron Jobs
// ========================
app.listen(config.port, () => {
  console.log(`[APP] started on ${config.port}`);

  // ✅ cron 자동 시작
  shoppingRankCron.start();
  ecountProductCron.start();
  ecountInventoryCron.start();
});
