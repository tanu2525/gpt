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

        // UI label: Create / Edit / Delete
        trigger: {
            type: String,
            required: true
        },

        // Actual notification event: create / edit / delete / all
        triggerType: {
            type: String
        },

        zohoModuleId: {
            type: String
        },

        // Kept for compatibility with the previous implementation.
        zohoWebhookId: {
            type: String
        },

        zohoWorkflowRuleId: {
            type: String
        },

        // Notification channel information
        zohoChannelId: {
            type: String,
            index: true
        },

        zohoNotificationToken: {
            type: String,
            select: false
        },

        zohoNotificationExpiry: {
            type: Date
        },

        zohoNotificationEvent: {
            type: String
        },

        zohoNotificationResourceId: {
            type: String
        },

        zohoNotificationResourceName: {
            type: String
        },

        zohoApiDomain: {
            type: String,
            default: "https://www.zohoapis.com"
        },

        webhookUrl: {
            type: String
        },

        // Hash of the unique secret used by Zoho for this workflow webhook.
        // The raw secret is never stored in MongoDB.
        webhookSecretHash: {
            type: String,
            select: false
        },

        channel: {
            type: String,
            required: true
        },

        fallbackChannel: {
            type: String
        },

        templateId: {
            type: String,
            required: true
        },

        templateName: {
            type: String
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
        }
    },
    {
        timestamps: true
    }
);

WorkflowConfigSchema.index(
    {
        organizationId: 1,
        workflowName: 1
    },
    {
        unique: true
    }
);

module.exports =
    mongoose.model(
        "WorkflowConfig",
        WorkflowConfigSchema
    );
