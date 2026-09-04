const mongoose = require("mongoose");

const authkeySyncHistorySchema = new mongoose.Schema(
    {
        organizationId: {
            type: String,
            required: true,
            index: true
        },
        module: {
            type: String,
            required: true
        },
        listName: {
            type: String,
            default: ""
        },
        mappings: [
            {
                zohoField: String,
                payloadPath: String,
                label: String
            }
        ],
        total: {
            type: Number,
            default: 0
        },
        sent: {
            type: Number,
            default: 0
        },
        skipped: {
            type: Number,
            default: 0
        },
        failed: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: ["success", "partial", "failed"],
            default: "success"
        },
        failures: [
            {
                recordId: String,
                reason: String,
                type: String
            }
        ]
    },
    {
        timestamps: true
    }
);

authkeySyncHistorySchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model(
    "AuthkeySyncHistory",
    authkeySyncHistorySchema
);
