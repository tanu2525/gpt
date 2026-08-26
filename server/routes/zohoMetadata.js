const express = require("express");

const {
    getModules,
    getWorkflowConfiguration
} = require("../controllers/zohoMetadataController");

const router = express.Router();

router.get(
    "/modules",
    getModules
);

router.get(
    "/workflow-config/:moduleApiName",
    getWorkflowConfiguration
);

module.exports = router;