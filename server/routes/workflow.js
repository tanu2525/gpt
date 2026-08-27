const express = require("express");
const router = express.Router();

const workflowController =
    require("../controllers/workflowController");

// Zoho OAuth
router.get(
    "/zoho/oauth",
    workflowController.getZohoOAuthUrl
);

router.get(
    "/zoho/oauth/callback",
    workflowController.zohoOAuthCallback
);

router.get(
    "/zoho/modules",
    workflowController.getZohoModules
);

router.get(
    "/zoho/fields",
    workflowController.getZohoFields
);

router.post(
    "/save",
    workflowController.saveWorkflow
);

// Authentication is workflow-specific and is verified inside triggerWorkflow.
router.post(
    "/trigger/:workflowId",
    workflowController.triggerWorkflow
);

router.post(
    "/send",
    workflowController.sendWorkflowMessage
);

module.exports = router;
