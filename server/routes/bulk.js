const express = require("express");

const router = express.Router();

const bulkController =
require("../controllers/bulkController");

router.post(
    "/send",
    bulkController.sendBulkMessages
);

module.exports = router;