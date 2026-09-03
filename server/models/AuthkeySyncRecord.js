const mongoose = require("mongoose");

const authkeySyncRecordSchema = new mongoose.Schema(
    {
        historyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AuthkeySyncHistory",
            required: true,
            index: true
        },
        organizationId: {
            type: String,
            required: true,
            index: true
        },
        module: {
            type: String,
            required: true
        },
        recordId: String,
        status: {
            type: String,
            enum: ["sent", "skipped", "failed"],
            required: true
        },
        data: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        reason: String
    },
    {
        timestamps: true
    }
);

authkeySyncRecordSchema.index({ historyId: 1, createdAt: -1 });

module.exports = mongoose.model(
    "AuthkeySyncRecord",
    authkeySyncRecordSchema
);
