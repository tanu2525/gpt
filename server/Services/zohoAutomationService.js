const axios = require("axios");

const ZOHO_BASE_URL =
    process.env.ZOHO_CRM_BASE_URL ||
    "https://www.zohoapis.com/crm/v8";


function getHeaders(accessToken) {

    if (!accessToken) {
        throw new Error("Zoho OAuth access token is required");
    }

    return {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json"
    };
}


/*
 * Get module metadata
 */
async function getModules(accessToken) {

    const response = await axios.get(
        `${ZOHO_BASE_URL}/settings/modules`,
        {
            headers: getHeaders(accessToken)
        }
    );

    return response.data.modules || [];
}


/*
 * Find module by API name
 */
async function findModule(accessToken, moduleApiName) {

    const modules =
        await getModules(accessToken);

    const module =
        modules.find(
            item =>
                item.api_name === moduleApiName
        );

    if (!module) {

        const error =
            new Error(
                `Zoho module '${moduleApiName}' was not found.`
            );

        error.statusCode = 400;

        throw error;
    }

    return module;
}


/*
 * Build fields that Zoho should send
 */
function buildWebhookFields(workflow) {

    const fields = new Set();

    // Always send record ID
    fields.add("id");

    // Recipient field
    if (workflow.recipientField) {
        fields.add(workflow.recipientField);
    }

    // Workflow variables
    for (
        const field
        of Object.values(workflow.variables || {})
    ) {

        if (field) {
            fields.add(field);
        }
    }

    return [...fields];
}


/*
 * Create Zoho Webhook
 */
async function createWebhook({
    accessToken,
    workflow,
    module
}) {

    const webhookBaseUrl =
        process.env.WEBHOOK_BASE_URL;

    if (!webhookBaseUrl) {

        throw new Error(
            "WEBHOOK_BASE_URL is not configured."
        );
    }

    const webhookUrl =
        `${webhookBaseUrl}/api/workflow/trigger/${workflow._id}`;

    const fields =
        buildWebhookFields(workflow);

    /*
     * Build JSON body dynamically.
     *
     * Example:
     *
     * {
     *   "id": "${!Leads.id}",
     *   "Email": "${!Leads.Email}"
     * }
     */

    const bodyObject = {};

    for (const field of fields) {

        bodyObject[field] =
            `\${!${workflow.module}.${field}}`;
    }

    const payload = {

        webhooks: [

            {
                name:
                    `Authkey_${workflow.workflowName}`
                        .replace(/[^a-zA-Z0-9_ ]/g, "")
                        .substring(0, 50),

                description:
                    `Authkey webhook for ${workflow.module}`,

                module: {
                    api_name: module.api_name,
                    id: module.id
                },

                url: webhookUrl,

                http_method: "POST",

                authentication: {
                    type: "general"
                },

                headers: {

                    custom_parameters: [
                        {
                            name: "X-Workflow-Secret",
                            value:
                                process.env.WORKFLOW_WEBHOOK_SECRET
                        }
                    ]

                },

                body: {

                    raw_data_content:
                        JSON.stringify(bodyObject),

                    format: "JSON",

                    type: "raw"
                }
            }

        ]

    };

    const response =
        await axios.post(
            `${ZOHO_BASE_URL}/settings/automation/webhooks`,
            payload,
            {
                headers:
                    getHeaders(accessToken)
            }
        );

    const webhook =
        response.data.webhooks?.[0];

    if (!webhook?.details?.id) {

        throw new Error(
            "Zoho webhook was not created."
        );
    }

    return {

        id: webhook.details.id,

        url: webhookUrl
    };
}


/*
 * Create Zoho Workflow Rule
 */
async function createWorkflowRule({
    accessToken,
    workflow,
    module,
    webhookId
}) {

    const triggerType =
        workflow.triggerType ||
        workflow.trigger;

    const payload = {

        workflow_rules: [

            {

                execute_when: {

                    details: {

                        trigger_module: {

                            api_name:
                                module.api_name,

                            id:
                                module.id
                        }
                    },

                    type:
                        triggerType
                },

                module: {

                    api_name:
                        module.api_name,

                    id:
                        module.id
                },

                name:
                    workflow.workflowName,

                description:
                    `Authkey ${workflow.channel} workflow`,

                conditions: [

                    {

                        sequence_number: 1,

                        criteria_details: null,

                        instant_actions: {

                            actions: [

                                {

                                    id:
                                        webhookId,

                                    type:
                                        "webhooks"
                                }

                            ]

                        },

                        scheduled_actions: []
                    }

                ]

            }

        ]

    };


    const response =
        await axios.post(
            `${ZOHO_BASE_URL}/settings/automation/workflow_rules`,
            payload,
            {
                headers:
                    getHeaders(accessToken)
            }
        );


    const rule =
        response.data.workflow_rules?.[0];

    if (!rule?.details?.id) {

        throw new Error(
            "Zoho workflow rule was not created."
        );
    }

    return rule.details.id;
}


/*
 * Complete setup:
 *
 * 1. Find module
 * 2. Create webhook
 * 3. Create workflow rule
 */
async function setupZohoAutomation({
    accessToken,
    workflow
}) {

    const module =
        await findModule(
            accessToken,
            workflow.module
        );


    /*
     * Zoho does not allow webhooks
     * for Call Logs and Notes.
     */
    if (
        module.api_name === "Notes" ||
        module.api_name === "Calls"
    ) {

        const error =
            new Error(
                `Zoho does not allow this webhook configuration for ${module.api_name}.`
            );

        error.statusCode = 400;

        throw error;
    }


    const webhook =
        await createWebhook({
            accessToken,
            workflow,
            module
        });


    let workflowRuleId;

    try {

        workflowRuleId =
            await createWorkflowRule({

                accessToken,

                workflow,

                module,

                webhookId:
                    webhook.id
            });

    } catch (error) {

        /*
         * If workflow creation fails,
         * remove the orphan webhook.
         */

        try {

            await axios.delete(
                `${ZOHO_BASE_URL}/settings/automation/webhooks/${webhook.id}`,
                {
                    headers:
                        getHeaders(accessToken)
                }
            );

        } catch (cleanupError) {

            console.error(
                "Webhook cleanup failed:",
                cleanupError.response?.data ||
                cleanupError.message
            );
        }

        throw error;
    }


    return {

        zohoModuleId:
            module.id,

        zohoWebhookId:
            webhook.id,

        zohoWorkflowRuleId:
            workflowRuleId,

        webhookUrl:
            webhook.url
    };
}


module.exports = {

    getModules,

    findModule,

    createWebhook,

    createWorkflowRule,

    setupZohoAutomation

};