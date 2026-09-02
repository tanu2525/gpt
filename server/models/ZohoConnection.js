const mongoose = require("mongoose");

const zohoConnectionSchema = new mongoose.Schema(
    {
        // The Zoho SDK organization ID identifies the installed organization.
        // Sandbox and Production can have different IDs and therefore get
        // separate connection records.
        organizationId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        refreshToken: {
            type: String,
            required: true,
            select: false
        },
        // Returned by Zoho during OAuth. This is important because sandbox
        // tokens must use sandbox.zohoapis.* instead of production APIs.
        apiDomain: {
            type: String,
            required: true,
            default: "https://www.zohoapis.in"
        },
        environment: {
            type: String,
            enum: ["production", "sandbox", "developer", "unknown"],
            default: "unknown"
        },
        scope: {
            type: String,
            default: ""
        },
        connectedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("ZohoConnection", zohoConnectionSchema);
