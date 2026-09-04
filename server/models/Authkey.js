const mongoose = require("mongoose");

const authkeySchema = new mongoose.Schema(
    {
        organizationId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
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

        // Zoho OAuth credentials are intentionally stored only in ZohoConnection.
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
