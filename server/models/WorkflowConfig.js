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

    templateId: String,

    templateName: String,

    recipientField: String,

    variables: {
        type: Object,
        default: {}
    }

}, {
    timestamps: true
});

module.exports =
    mongoose.model(
        "WorkflowConfig",
        WorkflowConfigSchema
    );