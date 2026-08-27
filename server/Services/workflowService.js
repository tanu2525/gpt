const axios = require("axios");
const messageService = require("./messageService");
const WorkflowConfig = require("../models/WorkflowConfig");
const zohoOAuthService = require("./zohoOAuthService");
const zohoCrmService = require("./zohoCrmService");

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

function getLookupModule(field) {
    return (
        field?.lookup?.module?.api_name ||
        field?.lookup?.module?.apiName ||
        field?.lookup?.module ||
        field?.associated_module?.module?.api_name ||
        field?.associated_module?.module ||
        field?.connected_details?.module?.api_name ||
        field?.connected_details?.module
    );
}

async function resolveRecipient({
    record,
    recipientField,
    channel,
    accessToken,
    apiDomain,
    module
}) {
    const value = record?.[recipientField];

    if (typeof value === "string" || typeof value === "number") {
        return String(value);
    }

    if (!value || typeof value !== "object" || !value.id) {
        return null;
    }

    // Lookup field, e.g. Deals.Contact_Name.
    const fields = await zohoCrmService.getFields(
        accessToken,
        module,
        apiDomain
    );

    const metadata = fields.find(
        field => field.api_name === recipientField
    );

    const relatedModule = getLookupModule(metadata);

    if (!relatedModule) {
        return null;
    }

    const relatedRecord = await fetchRecord(
        value.id,
        relatedModule,
        accessToken,
        apiDomain
    );

    if (!relatedRecord) {
        return null;
    }

    return String(channel).toLowerCase() === "email"
        ? relatedRecord.Email
        : relatedRecord.Mobile || relatedRecord.Phone;
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

    const recipient = await resolveRecipient({
        record,
        recipientField: String(channel).toLowerCase() === "email" ? "Email" : "Mobile",
        channel,
        accessToken: tokenData.accessToken,
        apiDomain: tokenData.apiDomain,
        module
    }) || record.Mobile || record.Phone || record.Email;

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

    const recipient = await resolveRecipient({
        record,
        recipientField: workflow.recipientField,
        channel: workflow.channel,
        accessToken: tokenData.accessToken,
        apiDomain: tokenData.apiDomain,
        module: workflow.module
    }) || payload.recipient;

    if (!recipient) {
        const error = new Error(
            `The workflow could not resolve ${workflow.recipientField} for Zoho ${workflow.module} record ${recordId}.`
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
