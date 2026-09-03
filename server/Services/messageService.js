const authkeyService = require("./authkeyService");
const DeliveryLog = require("../models/DeliveryLog");

function getProviderMessageId(result = {}) {
    return result.LogID || result.logid || result.message_id || result.id || null;
}

function summarizeProviderResponse(result = {}) {
    if (!result || typeof result !== "object") return null;

    return {
        status: result.status || result.Status || result.message_status || null,
        message: result.message || result.Message || null,
        code: result.code || result.Code || result.error_code || null,
        logId: getProviderMessageId(result)
    };
}

async function sendMessage({
    organizationId,
    channel,
    recipient,
    templateId,
    templateName,
    recordId,
    module,
    variables
}) {
    const result = await authkeyService.sendMessage({
        organizationId,
        channel,
        recipient,
        templateId,
        variables
    });

    const providerMessageId = getProviderMessageId(result);
    const providerResponse = summarizeProviderResponse(result);

    const log = await DeliveryLog.create({
        organizationId,
        channel,
        recipient,
        templateId,
        templateName,
        recordId,
        module,
        status: "accepted",
        providerMessageId,
        providerStatus: providerResponse?.status || "accepted",
        providerCode: providerResponse?.code || undefined,
        providerResponse
    });

    return {
        result,
        log
    };
}

module.exports = {
    sendMessage
};
