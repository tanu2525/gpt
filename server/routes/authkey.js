const express = require("express");
const router = express.Router();

const Authkey = require("../models/Authkey");
const { encrypt } = require("../utils/crypto");

// Save Authkey
router.post("/save", async (req, res) => {
    try {

        const { organizationId, authkey, fieldMappings = {} } = req.body;

        if (!organizationId || !authkey) {
            return res.status(400).json({
                success: false,
                message: "Organization ID and Authkey are required"
            });
        }

        const existing = await Authkey.findOne({ organizationId });

        if (existing) {

            const secured = encrypt(authkey);
            existing.encryptedCredentials = secured.encrypted;
            existing.credentialIv = secured.iv;
            existing.credentialTag = secured.tag;
            existing.fieldMappings = fieldMappings;
            await existing.save();

            return res.json({
                success: true,
                message: "Authkey Updated"
            });

        }

        const secured = encrypt(authkey);
        await Authkey.create({ organizationId, encryptedCredentials: secured.encrypted, credentialIv: secured.iv, credentialTag: secured.tag, fieldMappings });

        res.json({
            success: true,
            message: "Authkey Saved"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false,
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

        res.json({ configured: true, fieldMappings: auth.fieldMappings, lastValidatedAt: auth.lastValidatedAt });

    } catch (err) {

        res.status(500).json({
            message: err.message
        });

    }
});

module.exports = router;
