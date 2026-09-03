const ALLOWED_MODULES = new Set(["Leads", "Contacts", "Accounts", "Deals", "Tasks"]);
const ALLOWED_TRIGGERS = new Set(["create", "edit"]);
const ALLOWED_CHANNELS = new Set(["whatsapp", "sms", "email", "voice", "rcs"]);

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

function validateWorkflowInput(body = {}) {
    const workflowName = requiredString(body.workflowName, "workflowName", { maxLength: 100 });
    const organizationId = requiredString(body.organizationId, "organizationId", { maxLength: 100 });
    const module = requiredString(body.module, "module", { maxLength: 100 });
    const trigger = requiredString(body.trigger, "trigger", { maxLength: 30 }).toLowerCase();
    const channel = requiredString(body.channel, "channel", { maxLength: 30 }).toLowerCase();
    const templateId = requiredString(body.templateId, "templateId", { maxLength: 200 });
    const recipientField = requiredString(body.recipientField, "recipientField", { maxLength: 200 });

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
        organizationId,
        workflowName,
        module,
        trigger,
        channel,
        templateId,
        templateName: String(body.templateName || "").trim().slice(0, 200),
        recipientField,
        variables,
        autoConfigureZoho: body.autoConfigureZoho !== false
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
    requiredString,
    validateWorkflowInput,
    getBulkConcurrency
};
