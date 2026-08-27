const axios = require("axios");
const messageService = require("./messageService");
const WorkflowConfig = require("../models/WorkflowConfig");
const zohoOAuthService = require("./zohoOAuthService");

function getRecordId(payload = {}) {
    return (
        payload.recordId ||
        payload.id ||
        payload.record?.id ||
        payload.record?.Id ||
        payload.ids?.[0]
    );
}

async function fetchRecord(recordId, module, accessToken, apiDomain) {
    if (!recordId) throw new Error("Zoho recordId is required.");
    if (!module) throw new Error("Zoho module is required.");
    if (!accessToken) throw new Error("Zoho OAuth access token is required.");

    const baseUrl = String(apiDomain || "https://www.zohoapis.in")
        .replace(/\/$/, "")
        .replace(/\/crm\/v\d+$/i, "") + "/crm/v8";

    const response = await axios.get(
        `${baseUrl}/${encodeURIComponent(module)}/${encodeURIComponent(recordId)}`,
        {
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`
            }
        }
    );

    return response.data?.data?.[0] || null;
}

async function resolveAccessToken(organizationId, accessToken) {
    if (accessToken) {
        return {
            accessToken,
            apiDomain: process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in"
        };
    }

    return zohoOAuthService.getAccessToken(String(organizationId));
}

exports.send = async function(data) {
    const {
        organizationId,
        accessToken,
        recordId,
        module,
        channel,
        templateId,
        templateName,
        variables
    } = data;

    const tokenData = await resolveAccessToken(organizationId, accessToken);
    const record = await fetchRecord(
        recordId,
        module,
        tokenData.accessToken,
        tokenData.apiDomain
    );

    if (!record) {
        throw new Error(`Zoho record ${recordId} was not found.`);
    }

    const recipient =
        String(channel).toLowerCase() === "email"
            ? record.Email
            : record.Mobile || record.Phone;

    if (!recipient) {
        throw new Error(`No recipient was found in the Zoho ${module} record.`);
    }

    return messageService.sendMessage({
        organizationId,
        channel,
        recipient,
        templateId,
        templateName,
        recordId,
        module,
        variables
    });
};

exports.trigger = async function(workflowId, payload = {}) {
    const workflow = await WorkflowConfig.findOne({
        _id: workflowId,
        enabled: true
    }).select("+zohoNotificationToken");

    if (!workflow) {
        const error = new Error("Workflow was not found or is disabled.");
        error.statusCode = 404;
        throw error;
    }

    const recordId = getRecordId(payload);
    const tokenData = await resolveAccessToken(workflow.organizationId);

    // Zoho workflow webhooks may send only the record ID.
    // Always fetch the current record before resolving recipient/variables.
    const record = await fetchRecord(
        recordId,
        workflow.module,
        tokenData.accessToken,
        tokenData.apiDomain
    );

    if (!record) {
        throw new Error(
            `Zoho record ${recordId} was not found in ${workflow.module}.`
        );
    }

    const recipient =
        record[workflow.recipientField] ??
        payload.recipient;

    if (!recipient) {
        const error = new Error(
            `The workflow could not find ${workflow.recipientField} for Zoho ${workflow.module} record ${recordId}.`
        );
        error.statusCode = 400;
        throw error;
    }

    const variables = Object.fromEntries(
        Object.entries(workflow.variables || {}).map(([name, field]) => [
            name,
            record[field] ?? ""
        ])
    );

    const message = {
        organizationId: workflow.organizationId,
        channel: String(workflow.channel).toLowerCase(),
        recipient,
        templateId: workflow.templateId,
        templateName: workflow.templateName,
        recordId,
        module: workflow.module,
        variables
    };

    try {
        const sent = await messageService.sendMessage(message);

        return {
            workflowId: workflow._id,
            logId: sent.log?._id,
            channel: workflow.channel
        };
    } catch (primaryError) {
        if (
            !workflow.fallbackChannel ||
            String(workflow.fallbackChannel).toLowerCase() ===
                String(workflow.channel).toLowerCase()
        ) {
            throw primaryError;
        }

        const sent = await messageService.sendMessage({
            ...message,
            channel: workflow.fallbackChannel
        });

        return {
            workflowId: workflow._id,
            logId: sent.log?._id,
            channel: workflow.fallbackChannel,
            fallbackUsed: true,
            primaryError: primaryError.message
        };
    }
};

exports.fetchRecord = fetchRecord;
