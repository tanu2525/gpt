const express = require("express");
const router = express.Router();

const workflowController =
    require("../controllers/workflowController");

const crypto = require("crypto");

function verifyWorkflowSecret(
    req,
    res,
    next
) {
    const expected =
        process.env.WORKFLOW_WEBHOOK_SECRET;

    const received =
        req.get("X-Workflow-Secret");

    if (
        !expected ||
        !received
    ) {
        return res.status(401).json({
            success: false,
            message:
                "Workflow webhook is not authorized."
        });
    }

    const expectedBuffer =
        Buffer.from(expected);

    const receivedBuffer =
        Buffer.from(received);

    if (
        expectedBuffer.length !==
            receivedBuffer.length ||
        !crypto.timingSafeEqual(
            expectedBuffer,
            receivedBuffer
        )
    ) {
        return res.status(401).json({
            success: false,
            message:
                "Workflow webhook is not authorized."
        });
    }

    next();
}


/*
 * Zoho OAuth
 */
router.get(
    "/zoho/oauth/url",
    workflowController.getZohoOAuthUrl
);

router.get(
    "/zoho/oauth/callback",
    workflowController.zohoOAuthCallback
);


/*
 * Zoho CRM Notifications callback.
 *
 * Do NOT put verifyWorkflowSecret here because Zoho
 * cannot send our custom X-Workflow-Secret header.
 *
 * Zoho's callback token is validated inside the controller.
 */
router.post(
    "/zoho/notifications",
    workflowController.zohoNotification
);


/*
 * Existing workflow endpoints
 */
router.post(
    "/save",
    workflowController.saveWorkflow
);

router.post(
    "/trigger/:workflowId",
    verifyWorkflowSecret,
    workflowController.triggerWorkflow
);

router.post(
    "/send",
    workflowController.sendWorkflowMessage
);

router.get(
    "/zoho/test",
    workflowController.testOAuth
);

module.exports = router;
