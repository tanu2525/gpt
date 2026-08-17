const express = require("express");

const router =
    express.Router();

const { sendWorkflowMessage} = require("../controllers/hubspotWorkflowController");


router.post(
    "/send",
    sendWorkflowMessage
);


module.exports = router;