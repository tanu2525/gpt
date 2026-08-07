const express = require("express");
const router = express.Router();
const DeliveryLog = require("../models/DeliveryLog");

router.get("/detail/:id", async (req, res) => {

    try {

        const log = await DeliveryLog.findById(req.params.id);

        if (!log) {

            return res.status(404).json({
                message: "History not found"
            });

        }

        res.json(log);

    } catch (err) {

        res.status(500).json({
            message: err.message
        });

    }

});

router.get("/:organizationId", async (req, res) => {

    const filter = {
        organizationId: req.params.organizationId
    };

    if (req.query.channel) {
        filter.channel = req.query.channel;
    }

    if (req.query.recipient) {
        filter.recipient = {
            $regex: req.query.recipient,
            $options: "i"
        };
    }

    const logs = await DeliveryLog
        .find(filter)
        .sort({ createdAt: -1 });

    res.json(logs);

});

module.exports = router;