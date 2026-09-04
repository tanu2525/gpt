const express = require("express");
const router = express.Router();

const Authkey = require("../models/Authkey");
const { encrypt } = require("../utils/crypto");
const { validateAuthkey } = require("../Services/authkeyService");

function maskAuthkey(value) {
    if (!value) return "";
    return "••••••••••••";
}

// Validate and save Authkey
router.post("/save", async (req, res) => {
    try {
        const { organizationId, email, authkey, fieldMappings = {} } = req.body;

        const normalizedEmail = String(email || "").trim().toLowerCase();
        const normalizedAuthkey = String(authkey || "").trim();

        if (!organizationId || !normalizedEmail || !normalizedAuthkey) {
            return res.status(400).json({
                success: false,
                message: "Organization ID, email and Authkey are required"
            });
        }

        const validation = await validateAuthkey(normalizedAuthkey);

        if (!validation.valid) {
            return res.status(401).json({
                success: false,
                code: "INVALID_AUTHKEY",
                message: "Invalid Authkey. Please enter a valid Authkey."
            });
        }

        const authkeyEmail = String(validation.email || "")
            .trim()
            .toLowerCase();

        if (!authkeyEmail) {
            return res.status(400).json({
                success: false,
                code: "EMAIL_NOT_FOUND",
                message: "No email was found for this Authkey."
            });
        }

        if (normalizedEmail !== authkeyEmail) {
            return res.status(400).json({
                success: false,
                code: "EMAIL_AUTHKEY_MISMATCH",
                message: "The entered email is not associated with this Authkey. Please enter the correct email."
            });
        }

        const existing = await Authkey.findOne({ organizationId });
        const secured = encrypt(normalizedAuthkey);

        if (existing) {
            existing.email = authkeyEmail;
            existing.encryptedCredentials = secured.encrypted;
            existing.credentialIv = secured.iv;
            existing.credentialTag = secured.tag;
            existing.fieldMappings = fieldMappings;
            existing.lastValidatedAt = new Date();
            await existing.save();

            return res.json({
                success: true,
                email: existing.email,
                message: "Authkey Updated"
            });
        }

        await Authkey.create({
            organizationId,
            email: authkeyEmail,
            encryptedCredentials: secured.encrypted,
            credentialIv: secured.iv,
            credentialTag: secured.tag,
            fieldMappings,
            lastValidatedAt: new Date()
        });

        res.json({
            success: true,
            email: authkeyEmail,
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
            email: auth.email || "",
            maskedAuthkey: maskAuthkey(auth.encryptedCredentials),
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
