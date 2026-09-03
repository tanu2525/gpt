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
            required: true,
            trim: true
        },

        module: {
            type: String,
            required: true
        },

        trigger: {
            type: String,
            required: true,
            enum: ["create", "edit"]
        },

        triggerType: {
            type: String,
            required: true,
            enum: ["create", "edit"]
        },

        channel: {
            type: String,
            required: true
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
            default: true,
            index: true
        },

        // Zoho automation resources created for this workflow.
        zohoModuleId: String,
        zohoWebhookId: {
            type: String,
            index: true
        },
        zohoWorkflowRuleId: {
            type: String,
            index: true
        },
        // Always populated from the OAuth response; never default to a data center.
        zohoApiDomain: String,
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
