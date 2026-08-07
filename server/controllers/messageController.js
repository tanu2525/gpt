const messageService =
require("../Services/messageService");
const DeliveryLog = require("../models/DeliveryLog");

exports.sendMessage = async (req, res) => {

    try {
        const {

    organizationId,
    channel,
    recipient,
    templateId,
    templateName,
    recordId,
    module,
    variables

} = req.body;

const { result } =
await messageService.sendMessage({

    organizationId,
    channel,
    recipient,
    templateId,
    templateName,
    recordId,
    module,
    variables

});

res.json(result);

    } catch (error) {

        console.error(error);

        if (req.body.organizationId) await DeliveryLog.create({ organizationId: req.body.organizationId, channel: req.body.channel || "unknown", recipient: req.body.recipient, templateId: req.body.templateId, recordId: req.body.recordId, module: req.body.module, status: "failed", error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message
        });

    }

};
