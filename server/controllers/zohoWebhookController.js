const crypto = require("crypto");

function verifyWebhookSecret(req) {
    const expected = process.env.WORKFLOW_WEBHOOK_SECRET;
    const received = req.get("X-Workflow-Secret");

    if (!expected || !received) {
        return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
    );
}

exports.receiveWebhook = async (req, res) => {
    if (!verifyWebhookSecret(req)) {
        return res.status(401).json({
            success: false,
            message: "Zoho webhook is not authorized."
        });
    }

    try {
        console.log("\n========== ZOHO WEBHOOK RECEIVED ==========");
        console.log("Method:", req.method);
        console.log("Headers:", {
            "x-workflow-secret": req.get("X-Workflow-Secret") ? "[present]" : "[missing]",
            "content-type": req.get("Content-Type")
        });
        console.log("Body:", JSON.stringify(req.body, null, 2));
        console.log("===========================================\n");

        return res.status(200).json({
            success: true,
            message: "Zoho webhook received successfully."
        });
    } catch (error) {
        console.error("Zoho webhook error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to process Zoho webhook."
        });
    }
};
