const express = require("express");
const router = express.Router();

const Authkey = require("../models/Authkey");
const { encrypt } = require("../utils/crypto");
const { validateAuthkey } = require("../Services/authkeyService");

// Validate and save Authkey
router.post("/save", async (req, res) => {
    try {
        const { organizationId, authkey, fieldMappings = {} } = req.body;

        if (!organizationId || !authkey) {
            return res.status(400).json({
                success: false,
                message: "Organization ID and Authkey are required"
            });
        }

        const validation = await validateAuthkey(authkey);

        if (!validation.valid) {
            return res.status(401).json({
                success: false,
                code: "INVALID_AUTHKEY",
                message: "Invalid Authkey. Please enter a valid Authkey."
            });
        }

        const existing = await Authkey.findOne({ organizationId });
        const secured = encrypt(String(authkey).trim());

        if (existing) {
            existing.encryptedCredentials = secured.encrypted;
            existing.credentialIv = secured.iv;
            existing.credentialTag = secured.tag;
            existing.fieldMappings = fieldMappings;
            existing.lastValidatedAt = new Date();
            await existing.save();

            return res.json({
                success: true,
                message: "Authkey Updated"
            });
        }

        await Authkey.create({
            organizationId,
            encryptedCredentials: secured.encrypted,
            credentialIv: secured.iv,
            credentialTag: secured.tag,
            fieldMappings,
            lastValidatedAt: new Date()
        });

        res.json({
            success: true,
            message: "Authkey Saved"
        });
    } catch (err) {
        console.log(err.response?.data || err.message);

        res.status(err.statusCode || 500).json({
            success: false,
            code: err.code,
            message: err.message
        });
    }
});

router.get("/:organizationId", async (req, res) => {
    try {
        const auth = await Authkey.findOne({
            organizationId: req.params.organizationId
        });

        if (!auth) {
            return res.status(404).json({
                message: "Authkey not found"
            });
        }

        res.json({
            configured: true,
            fieldMappings: auth.fieldMappings,
            lastValidatedAt: auth.lastValidatedAt
        });
    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
});

module.exports = router;
