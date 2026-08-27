const mongoose = require("mongoose");

const zohoConnectionSchema = new mongoose.Schema(
    {
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
        apiDomain: {
            type: String,
            required: true,
            default: "https://www.zohoapis.in"
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

module.exports = mongoose.model(
    "ZohoConnection",
    zohoConnectionSchema
);
