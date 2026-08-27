const express = require("express");

const router = express.Router();
const controller = require("../controllers/zohoAuthkeyBulkController");

router.post("/sync-module", controller.syncModule);

module.exports = router;
