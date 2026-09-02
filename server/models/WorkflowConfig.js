const mongoose = require("mongoose");

const WorkflowConfigSchema = new mongoose.Schema(
    {
        organizationId: {
            type: String,
            required: true,
            index: true
        },

        workflowName: {
            type: String,
            required: true
        },

        module: {
            type: String,
            required: true
        },

        // Supported values: create, edit
        trigger: {
            type: String,
            required: true
        },

        // Kept explicitly because Zoho workflow automation uses this value.
        triggerType: {
            type: String,
            required: true
        },

        channel: {
            type: String,
            required: true
        },

        fallbackChannel: {
            type: String,
            default: ""
        },

        templateId: {
            type: String,
            required: true
        },

        templateName: {
            type: String,
            default: ""
        },

        recipientField: {
            type: String,
            required: true
        },

        variables: {
            type: Object,
            default: {}
        },

        enabled: {
            type: Boolean,
            default: true
        },

        // Zoho automation resources created for this workflow.
        zohoModuleId: String,
        zohoWebhookId: String,
        zohoWorkflowRuleId: String,
        zohoApiDomain: {
            type: String,
            default: "https://www.zohoapis.com"
        },
        webhookUrl: String,

        // Each workflow has its own secret. Only its SHA-256 hash is stored.
        webhookSecretHash: {
            type: String,
            select: false
        }
    },
    {
        timestamps: true
    }
);

WorkflowConfigSchema.index(
    { organizationId: 1, workflowName: 1 },
    { unique: true }
);

module.exports = mongoose.model("WorkflowConfig", WorkflowConfigSchema);
