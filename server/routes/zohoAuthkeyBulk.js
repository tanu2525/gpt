const express = require("express");

const router = express.Router();
const controller = require("../controllers/zohoAuthkeyBulkController");

router.get("/history/:organizationId", controller.getSyncHistory);
router.get(
    "/history/:organizationId/:historyId",
    controller.getSyncHistoryDetails
);
router.post("/sync-module", controller.syncModule);

module.exports = router;
