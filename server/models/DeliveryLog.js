const mongoose = require("mongoose");

const deliveryLogSchema = new mongoose.Schema({
    organizationId: { type: String, required: true, index: true },
    recordId: { type: String, index: true },
    module: String,
    channel: { type: String, required: true },
    recipient: String,
    templateId: String,
    templateName: String,
    providerMessageId: { type: String, index: true },
    status: {
        type: String,
        enum: ["queued", "accepted", "sent", "delivered", "failed", "received", "updated"],
        default: "queued",
        index: true
    },
    error: String,
    providerStatus: String,
    providerCode: String,
    direction: { type: String, enum: ["outbound", "inbound"], default: "outbound" },
    providerResponse: mongoose.Schema.Types.Mixed
}, { timestamps: true });

deliveryLogSchema.index({ organizationId: 1, createdAt: -1 });
deliveryLogSchema.index({ organizationId: 1, recordId: 1, createdAt: -1 });

module.exports = mongoose.model("DeliveryLog", deliveryLogSchema);
