const express = require("express");
const router = express.Router();

const zohoWebhookController = require("../controllers/zohoWebhookController");

router.post(
    "/",
    zohoWebhookController.receiveWebhook
);

module.exports = router;
