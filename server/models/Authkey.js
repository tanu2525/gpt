const mongoose = require("mongoose");

const authkeySchema = new mongoose.Schema(
    {
        organizationId: {
            type: String,
            required: true,
            unique: true
        },

        encryptedCredentials: {
            type: String,
            required: true
        },
        credentialIv: {
            type: String,
            required: true
        },
        credentialTag: {
            type: String,
            required: true
        },
        lastValidatedAt: Date,

        // Zoho CRM OAuth connection.
        // Refresh token is stored so the backend can generate
        // short-lived access tokens without asking Postman/UI for one.
        zohoRefreshToken: {
            type: String,
            select: false
        },
        zohoApiDomain: {
            type: String,
            default: "https://www.zohoapis.com"
        },
        zohoScope: {
            type: String,
            default: ""
        },

        fieldMappings: {
            type: Map,
            of: String,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Authkey", authkeySchema);
