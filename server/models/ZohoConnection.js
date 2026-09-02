const mongoose = require("mongoose");

const zohoConnectionSchema = new mongoose.Schema(
    {
        // The Zoho organization ID identifies the installed CRM organization.
        // Sandbox and Production organizations use separate IDs and therefore
        // have separate OAuth connection records.
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
        // This value is returned by Zoho during OAuth and must never be
        // replaced with a hardcoded data-center URL.
        apiDomain: {
            type: String,
            required: true
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
