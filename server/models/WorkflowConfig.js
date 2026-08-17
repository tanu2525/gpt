const mongoose = require("mongoose");

const WorkflowConfigSchema = new mongoose.Schema({

    organizationId: {
        type: String,
        required: true
    },

    workflowName: String,

    module: String,

    trigger: String,

    channel: String,

    fallbackChannel: String,

    templateId: String,

    templateName: String,

    recipientField: String,

    variables: {
        type: Object,
        default: {}
    },

    enabled: {
        type: Boolean,
        default: true
    }

}, {
    timestamps: true
});

module.exports =
    mongoose.model(
        "WorkflowConfig",
        WorkflowConfigSchema
    );
