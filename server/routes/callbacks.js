const express = require("express");
const crypto = require("crypto");
const DeliveryLog = require("../models/DeliveryLog");

const router = express.Router();

function verifySignature(req, res, next) {
    const secret = process.env.AUTHKEY_WEBHOOK_SECRET;
    const received = req.get("X-Authkey-Signature");
    if (!secret || !received || !req.rawBody) {
        return res.status(401).json({ success: false, message: "Callback is not authorized." });
    }

    const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
    const provided = received.replace(/^sha256=/i, "");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const providedBuffer = Buffer.from(provided, "utf8");
    if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        return res.status(401).json({ success: false, message: "Callback is not authorized." });
    }
    next();
}

async function handleDeliveryCallback(req, res) {
    try {
        const body = req.body;
        const providerMessageId = body.logid || body.LogID || body.message_id || body.id;
        if (!providerMessageId) {
            return res.status(400).json({ success: false, message: "Provider message ID is required." });
        }

        const log = await DeliveryLog.findOneAndUpdate(
            { providerMessageId },
            { status: body.status || body.Status || "updated", payload: body },
            { new: true }
        );
        if (!log) return res.status(404).json({ success: false, message: "Delivery log not found." });
        res.json({ success: true, logId: log._id });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

router.post("/delivery", verifySignature, handleDeliveryCallback);
router.post("/", verifySignature, handleDeliveryCallback);

router.post("/inbound", verifySignature, async (req, res) => {
    try {
        const body = req.body;
        const recipient = body.mobile || body.Mobile || body.email || body.recipient;
        if (!body.organizationId || !recipient) {
            return res.status(400).json({ success: false, message: "organizationId and sender are required." });
        }
        const log = await DeliveryLog.create({
            organizationId: String(body.organizationId),
            recordId: body.recordId,
            module: body.module,
            channel: body.channel || "unknown",
            recipient,
            providerMessageId: body.message_id || body.logid || body.LogID,
            status: "received",
            direction: "inbound",
            payload: body
        });
        res.status(201).json({ success: true, logId: log._id });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
