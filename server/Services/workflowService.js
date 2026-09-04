const axios = require("axios");
const messageService = require("./messageService");
const contactListService = require("./zohoAuthkeyBulkService");
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

function getCrmBaseUrl(apiDomain) {
    const normalized = String(apiDomain || "").trim()
        .replace(/\/$/, "")
        .replace(/\/crm\/v\d+$/i, "");

    if (!normalized) {
        throw new Error("Zoho API domain is required for CRM requests.");
    }

    return `${normalized}/crm/v8`;
}

async function fetchRecord(recordId, module, accessToken, apiDomain) {
    if (!recordId) throw new Error("Zoho recordId is required.");
    if (!module) throw new Error("Zoho module is required.");
    if (!accessToken) throw new Error("Zoho OAuth access token is required.");

    const response = await axios.get(
        `${getCrmBaseUrl(apiDomain)}/${encodeURIComponent(module)}/${encodeURIComponent(recordId)}`,
        {
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`
            }
        }
    );

    return response.data?.data?.[0] || null;
}

async function resolveAccessToken(organizationId, accessToken, apiDomain) {
    if (accessToken) {
        const explicitApiDomain = String(apiDomain || process.env.ZOHO_API_DOMAIN || "").trim();
        if (!explicitApiDomain) {
            throw new Error("Zoho API domain is required when an access token is supplied directly.");
        }

        return {
            accessToken,
            apiDomain: explicitApiDomain
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

async function getFieldMetadata(accessToken, module, apiDomain) {
    return zohoCrmService.getFields(accessToken, module, apiDomain);
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
        return String(value).trim() || null;
    }

    if (!value || typeof value !== "object" || !value.id) {
        return null;
    }

    const fields = await getFieldMetadata(accessToken, module, apiDomain);
    const metadata = fields.find(field => field.api_name === recipientField);
    const relatedModule = getLookupModule(metadata);

    if (!relatedModule) return null;

    const relatedRecord = await fetchRecord(
        value.id,
        relatedModule,
        accessToken,
        apiDomain
    );

    if (!relatedRecord) return null;

    const resolved = String(channel).toLowerCase() === "email"
        ? relatedRecord.Email
        : relatedRecord.Mobile || relatedRecord.Phone;

    return resolved ? String(resolved).trim() : null;
}

async function resolveMappedValue({
    record,
    fieldPath,
    accessToken,
    apiDomain,
    module,
    fieldMetadata
}) {
    const normalizedPath = String(fieldPath || "").trim();
    if (!normalizedPath) return "";

    const [rootField, ...rest] = normalizedPath.split(".");
    const directValue = record?.[rootField];

    if (!rest.length) {
        if (directValue === null || directValue === undefined) return "";
        if (typeof directValue === "object") {
            return String(directValue.name || directValue.id || "");
        }
        return String(directValue);
    }

    if (!directValue || typeof directValue !== "object" || !directValue.id) {
        return "";
    }

    const metadata = fieldMetadata.find(field => field.api_name === rootField);
    const relatedModule = getLookupModule(metadata);
    if (!relatedModule) return "";

    const relatedRecord = await fetchRecord(
        directValue.id,
        relatedModule,
        accessToken,
        apiDomain
    );

    if (!relatedRecord) return "";

    let value = relatedRecord;
    for (const part of rest) {
        value = value?.[part];
    }

    if (value === null || value === undefined) return "";
    if (typeof value === "object") return String(value.name || value.id || "");
    return String(value);
}

async function resolveVariables({ workflow, record, accessToken, apiDomain }) {
    const mappings = Object.entries(workflow.variables || {});
    if (!mappings.length) return {};

    const fieldMetadata = await getFieldMetadata(
        accessToken,
        workflow.module,
        apiDomain
    );

    const variables = {};

    for (const [name, fieldPath] of mappings) {
        variables[name] = await resolveMappedValue({
            record,
            fieldPath,
            accessToken,
            apiDomain,
            module: workflow.module,
            fieldMetadata
        });
    }

    return variables;
}

exports.send = async function(data) {
    const {
        organizationId,
        accessToken,
        apiDomain,
        recordId,
        module,
        channel,
        templateId,
        templateName,
        variables
    } = data;

    const tokenData = await resolveAccessToken(organizationId, accessToken, apiDomain);
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
    });

    if (!workflow) {
        const error = new Error("Workflow was not found or is disabled.");
        error.statusCode = 404;
        throw error;
    }

    const recordId = getRecordId(payload);
    if (!recordId) {
        const error = new Error("Zoho workflow payload does not contain a record ID.");
        error.statusCode = 400;
        throw error;
    }

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

    if (workflow.actionType === "contact_list") {
        const result = await contactListService.sendRecordToContactList({
            organizationId: workflow.organizationId,
            module: workflow.module,
            record,
            listName: workflow.contactListName,
            mappings: workflow.contactMappings
        });

        return {
            workflowId: workflow._id,
            actionType: "contact_list",
            recordId,
            listName: workflow.contactListName,
            status: "sent",
            providerResponse: result.providerResponse
        };
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

    const variables = await resolveVariables({
        workflow,
        record,
        accessToken: tokenData.accessToken,
        apiDomain: tokenData.apiDomain
    });

    const sent = await messageService.sendMessage({
        organizationId: workflow.organizationId,
        channel: String(workflow.channel).toLowerCase(),
        recipient,
        templateId: workflow.templateId,
        templateName: workflow.templateName,
        recordId,
        module: workflow.module,
        variables
    });

    return {
        workflowId: workflow._id,
        actionType: "message",
        logId: sent.log?._id,
        channel: workflow.channel,
        status: sent.log?.status || "accepted"
    };
};

exports.fetchRecord = fetchRecord;
exports.resolveMappedValue = resolveMappedValue;
exports.resolveVariables = resolveVariables;
