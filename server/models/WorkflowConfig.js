const mongoose = require("mongoose");

const ContactMappingSchema = new mongoose.Schema(
    {
        zohoField: {
            type: String,
            required: true
        },
        payloadPath: {
            type: String,
            required: true
        }
    },
    { _id: false }
);

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

        actionType: {
            type: String,
            required: true,
            enum: ["message", "contact_list"],
            default: "message"
        },

        channel: {
            type: String,
            default: ""
        },

        templateId: {
            type: String,
            default: ""
        },

        templateName: {
            type: String,
            default: ""
        },

        recipientField: {
            type: String,
            default: ""
        },

        variables: {
            type: Object,
            default: {}
        },

        contactListName: {
            type: String,
            default: ""
        },

        contactMappings: {
            type: [ContactMappingSchema],
            default: []
        },

        enabled: {
            type: Boolean,
            default: true,
            index: true
        },

        zohoModuleId: String,
        zohoWebhookId: {
            type: String,
            index: true
        },
        zohoWorkflowRuleId: {
            type: String,
            index: true
        },
        zohoApiDomain: String,
        webhookUrl: String,

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
