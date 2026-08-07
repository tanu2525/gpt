const express = require("express");
const router = express.Router();
const authkeyService = require("../Services/authkeyService");

router.get("/:organizationId", async (req, res) => {
    try {

        const { organizationId } = req.params;
         const channel =
req.query.channel || "whatsapp";
        res.json(await authkeyService.listTemplates(organizationId, channel));

    } catch (err) {

        console.log(err.response?.data || err.message);

        res.status(err.statusCode || 500).json({
            success: false,
            error: err.response?.data || err.message
        });

    }
});

module.exports = router;
