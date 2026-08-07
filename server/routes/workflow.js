const express = require("express");
const router = express.Router();

const workflowController =
require("../controllers/workflowController");

router.post(
    "/send",
    workflowController.sendWorkflowMessage
);

module.exports = router;