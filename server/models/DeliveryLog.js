const mongoose = require("mongoose");

const deliveryLogSchema = new mongoose.Schema({
    organizationId: { type: String, required: true, index: true },
    recordId: { type: String, index: true },
    module: String,
    channel: { type: String, required: true },
    recipient: String,
    templateId: String,
    providerMessageId: { type: String, index: true },
    status: { type: String, default: "queued" },
    error: String,
    direction: { type: String, enum: ["outbound", "inbound"], default: "outbound" },
    payload: mongoose.Schema.Types.Mixed,
    templateName: String,
}, { timestamps: true });

module.exports = mongoose.model("DeliveryLog", deliveryLogSchema);
