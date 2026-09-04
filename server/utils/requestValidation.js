const ALLOWED_MODULES = new Set(["Leads", "Contacts", "Accounts", "Deals", "Tasks"]);
const ALLOWED_TRIGGERS = new Set(["create", "edit"]);
const ALLOWED_CHANNELS = new Set(["whatsapp", "sms", "email", "voice", "rcs"]);
const ALLOWED_WORKFLOW_ACTIONS = new Set(["message", "contact_list"]);

function requiredString(value, fieldName, { maxLength = 500 } = {}) {
    const normalized = String(value || "").trim();

    if (!normalized) {
        const error = new Error(`${fieldName} is required.`);
        error.statusCode = 400;
        throw error;
    }

    if (normalized.length > maxLength) {
        const error = new Error(`${fieldName} is too long.`);
        error.statusCode = 400;
        throw error;
    }

    return normalized;
}

function normalizeContactMappings(mappings) {
    if (!Array.isArray(mappings)) return [];

    const seen = new Set();

    return mappings
        .map(mapping => ({
            zohoField: String(mapping?.zohoField || "").trim().slice(0, 200),
            payloadPath: String(mapping?.payloadPath || "").trim().slice(0, 200)
        }))
        .filter(mapping => {
            if (!mapping.zohoField || !mapping.payloadPath) return false;
            const key = `${mapping.zohoField}:${mapping.payloadPath}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function validateWorkflowInput(body = {}) {
    const workflowName = requiredString(body.workflowName, "workflowName", { maxLength: 100 });
    const organizationId = requiredString(body.organizationId, "organizationId", { maxLength: 100 });
    const module = requiredString(body.module, "module", { maxLength: 100 });
    const trigger = requiredString(body.trigger, "trigger", { maxLength: 30 }).toLowerCase();
    const actionType = String(body.actionType || body.workflowAction || "message").trim().toLowerCase();

    if (!ALLOWED_MODULES.has(module)) {
        const error = new Error(`Supported modules are: ${[...ALLOWED_MODULES].join(", ")}.`);
        error.statusCode = 400;
        throw error;
    }

    if (!ALLOWED_TRIGGERS.has(trigger)) {
        const error = new Error("Only Create and Update triggers are supported.");
        error.statusCode = 400;
        throw error;
    }

    if (!ALLOWED_WORKFLOW_ACTIONS.has(actionType)) {
        const error = new Error("Supported workflow actions are Send Message and Send to Contact List.");
        error.statusCode = 400;
        throw error;
    }

    const base = {
        organizationId,
        workflowName,
        module,
        trigger,
        actionType,
        autoConfigureZoho: body.autoConfigureZoho !== false
    };

    if (actionType === "contact_list") {
        const contactListName = requiredString(body.contactListName, "contactListName", { maxLength: 200 });
        const contactMappings = normalizeContactMappings(body.contactMappings);

        if (!contactMappings.length) {
            const error = new Error("Add at least one Zoho field mapping for the Authkey contact list.");
            error.statusCode = 400;
            throw error;
        }

        return {
            ...base,
            channel: "contact_list",
            templateId: "",
            templateName: "",
            recipientField: "",
            variables: {},
            contactListName,
            contactMappings
        };
    }

    const channel = requiredString(body.channel, "channel", { maxLength: 30 }).toLowerCase();
    const templateId = requiredString(body.templateId, "templateId", { maxLength: 200 });
    const recipientField = requiredString(body.recipientField, "recipientField", { maxLength: 200 });

    if (!ALLOWED_CHANNELS.has(channel)) {
        const error = new Error(`Supported channels are: ${[...ALLOWED_CHANNELS].join(", ")}.`);
        error.statusCode = 400;
        throw error;
    }

    const variables = body.variables && typeof body.variables === "object" && !Array.isArray(body.variables)
        ? Object.fromEntries(
            Object.entries(body.variables)
                .filter(([name, field]) => String(name || "").trim() && String(field || "").trim())
                .map(([name, field]) => [
                    String(name).trim().slice(0, 100),
                    String(field).trim().slice(0, 300)
                ])
        )
        : {};

    return {
        ...base,
        channel,
        templateId,
        templateName: String(body.templateName || "").trim().slice(0, 200),
        recipientField,
        variables,
        contactListName: "",
        contactMappings: []
    };
}

function getBulkConcurrency(value, fallback = 5) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(Math.floor(parsed), 20));
}

module.exports = {
    ALLOWED_MODULES,
    ALLOWED_TRIGGERS,
    ALLOWED_CHANNELS,
    ALLOWED_WORKFLOW_ACTIONS,
    requiredString,
    validateWorkflowInput,
    getBulkConcurrency
};
