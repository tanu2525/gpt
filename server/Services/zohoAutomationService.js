const axios = require("axios");

function getBaseUrl(apiDomain) {
    const domain = String(apiDomain || "")
        .trim()
        .replace(/\/$/, "")
        .replace(/\/crm\/v\d+$/i, "");

    if (!domain) {
        throw new Error("Zoho API domain is required.");
    }

    return `${domain}/crm/v8`;
}

function getHeaders(accessToken) {
    if (!accessToken) {
        throw new Error("Zoho OAuth access token is required");
    }

    return {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json"
    };
}

async function getModules(accessToken, apiDomain) {
    const response = await axios.get(
        `${getBaseUrl(apiDomain)}/settings/modules`,
        { headers: getHeaders(accessToken) }
    );

    return response.data.modules || [];
}

async function findModule(accessToken, moduleApiName, apiDomain) {
    const modules = await getModules(accessToken, apiDomain);
    const module = modules.find(item => item.api_name === moduleApiName);

    if (!module) {
        const error = new Error(`Zoho module '${moduleApiName}' was not found.`);
        error.statusCode = 400;
        throw error;
    }

    return module;
}

function getRootField(fieldPath) {
    return String(fieldPath || "").split(".")[0].trim();
}

function buildWebhookFields(workflow) {
    const fields = new Set(["id"]);

    if (workflow.recipientField) {
        fields.add(getRootField(workflow.recipientField));
    }

    for (const field of Object.values(workflow.variables || {})) {
        const rootField = getRootField(field);
        if (rootField) fields.add(rootField);
    }

    return [...fields];
}

function buildSecretHeader(webhookSecret) {
    if (!webhookSecret) {
        throw new Error("Workflow webhook secret is required.");
    }

    return {
        custom_parameters: [{
            name: "X-Workflow-Secret",
            value: webhookSecret
        }]
    };
}

async function createWebhook({
    accessToken,
    workflow,
    module,
    apiDomain,
    webhookSecret
}) {
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;

    if (!webhookBaseUrl) {
        throw new Error("WEBHOOK_BASE_URL is not configured.");
    }

    const webhookUrl = `${webhookBaseUrl.replace(/\/$/, "")}/api/workflow/trigger/${workflow._id}`;
    const bodyObject = {};

    for (const field of buildWebhookFields(workflow)) {
        bodyObject[field] = `\${!${workflow.module}.${field}}`;
    }

    const payload = {
        webhooks: [{
            name: `Authkey_${workflow.workflowName}`
                .replace(/[^a-zA-Z0-9_ ]/g, "")
                .substring(0, 50),
            description: `Authkey webhook for ${workflow.module}`,
            module: {
                api_name: module.api_name,
                id: module.id
            },
            url: webhookUrl,
            http_method: "POST",
            authentication: { type: "general" },
            headers: buildSecretHeader(webhookSecret),
            body: {
                raw_data_content: JSON.stringify(bodyObject),
                format: "JSON",
                type: "raw"
            }
        }]
    };

    const response = await axios.post(
        `${getBaseUrl(apiDomain)}/settings/automation/webhooks`,
        payload,
        { headers: getHeaders(accessToken) }
    );

    const webhook = response.data.webhooks?.[0];

    if (!webhook?.details?.id) {
        throw new Error("Zoho webhook was not created.");
    }

    return {
        id: webhook.details.id,
        url: webhookUrl
    };
}

async function createWorkflowRule({ accessToken, workflow, module, webhookId, apiDomain }) {
    const triggerType = String(workflow.triggerType || workflow.trigger || "").toLowerCase();

    if (!["create", "edit"].includes(triggerType)) {
        const error = new Error("Only Create and Edit workflow triggers are supported.");
        error.statusCode = 400;
        throw error;
    }

    const payload = {
        workflow_rules: [{
            execute_when: {
                details: {
                    trigger_module: {
                        api_name: module.api_name,
                        id: module.id
                    }
                },
                type: triggerType
            },
            module: {
                api_name: module.api_name,
                id: module.id
            },
            name: workflow.workflowName,
            description: `Authkey ${workflow.channel} workflow`,
            conditions: [{
                sequence_number: 1,
                criteria_details: {
                    criteria: null
                },
                instant_actions: {
                    actions: [{
                        id: webhookId,
                        type: "webhooks"
                    }]
                },
                scheduled_actions: []
            }]
        }]
    };

    const response = await axios.post(
        `${getBaseUrl(apiDomain)}/settings/automation/workflow_rules`,
        payload,
        { headers: getHeaders(accessToken) }
    );

    const rule = response.data.workflow_rules?.[0];

    if (!rule?.details?.id) {
        throw new Error("Zoho workflow rule was not created.");
    }

    return rule.details.id;
}

async function deleteWorkflowRule({ accessToken, workflowRuleId, apiDomain }) {
    if (!workflowRuleId) return;

    await axios.delete(
        `${getBaseUrl(apiDomain)}/settings/automation/workflow_rules/${workflowRuleId}`,
        { headers: getHeaders(accessToken) }
    );
}

async function deleteWebhook({ accessToken, webhookId, apiDomain }) {
    if (!webhookId) return;

    await axios.delete(
        `${getBaseUrl(apiDomain)}/settings/automation/webhooks/${webhookId}`,
        { headers: getHeaders(accessToken) }
    );
}

async function deleteZohoAutomation({
    accessToken,
    zohoWorkflowRuleId,
    zohoWebhookId,
    apiDomain
}) {
    // The rule references the webhook, so delete the rule first.
    if (zohoWorkflowRuleId) {
        await deleteWorkflowRule({
            accessToken,
            workflowRuleId: zohoWorkflowRuleId,
            apiDomain
        });
    }

    if (zohoWebhookId) {
        await deleteWebhook({
            accessToken,
            webhookId: zohoWebhookId,
            apiDomain
        });
    }
}

async function setupZohoAutomation({
    accessToken,
    workflow,
    apiDomain,
    webhookSecret
}) {
    const module = await findModule(accessToken, workflow.module, apiDomain);

    if (["Notes", "Calls"].includes(module.api_name)) {
        const error = new Error(
            `Zoho does not allow this webhook configuration for ${module.api_name}.`
        );
        error.statusCode = 400;
        throw error;
    }

    const webhook = await createWebhook({
        accessToken,
        workflow,
        module,
        apiDomain,
        webhookSecret
    });

    try {
        const workflowRuleId = await createWorkflowRule({
            accessToken,
            workflow,
            module,
            webhookId: webhook.id,
            apiDomain
        });

        return {
            zohoModuleId: module.id,
            zohoWebhookId: webhook.id,
            zohoWorkflowRuleId: workflowRuleId,
            webhookUrl: webhook.url
        };
    } catch (error) {
        try {
            await deleteWebhook({
                accessToken,
                webhookId: webhook.id,
                apiDomain
            });
        } catch (cleanupError) {
            console.error(
                "Webhook cleanup failed:",
                cleanupError.response?.data || cleanupError.message
            );
        }

        throw error;
    }
}

module.exports = {
    getModules,
    findModule,
    createWebhook,
    createWorkflowRule,
    deleteWorkflowRule,
    deleteWebhook,
    deleteZohoAutomation,
    setupZohoAutomation
};
