const workflowService = require("../Services/workflowService");
const WorkflowConfig = require("../models/WorkflowConfig");
const zohoOAuthService = require("../Services/zohoOAuthService");
const zohoCrmService = require("../Services/zohoCrmService");
const zohoAutomationService = require("../Services/zohoAutomationService");

exports.getZohoOAuthUrl = async function(req, res) {
    try {
        const { organizationId, apiDomain } = req.query;

        if (!organizationId) {
            return res.status(400).json({
                success: false,
                message: "organizationId is required."
            });
        }

        const authorizationUrl = zohoOAuthService.createAuthorizationUrl(
            String(organizationId),
            apiDomain
        );

        return res.json({ success: true, authorizationUrl });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message
        });
    }
};

exports.zohoOAuthCallback = async function(req, res) {
    try {
        const { code, state, error } = req.query;

        if (error) {
            return res.status(400).send(`Zoho authorization failed: ${error}`);
        }

        if (!code || !state) {
            return res.status(400).send(
                "Zoho authorization code/state is missing."
            );
        }

        const stateData = zohoOAuthService.getOrganizationFromState(state);
        const token = await zohoOAuthService.exchangeCode(
            code,
            stateData.redirectUri,
            stateData.apiDomain
        );

        if (!token.refresh_token) {
            return res.status(400).send(
                "Zoho did not return a refresh token. Make sure access_type=offline is used."
            );
        }

        await zohoOAuthService.saveRefreshToken({
            organizationId: stateData.organizationId,
            refreshToken: token.refresh_token,
            apiDomain: token.api_domain || stateData.apiDomain,
            scope: process.env.ZOHO_SCOPES
        });

        return res.send(
            "Zoho CRM connected successfully. You can close this window."
        );
    } catch (error) {
        console.error(
            "Zoho OAuth callback error:",
            error.response?.data || error.message
        );

        return res.status(
            error.statusCode || error.response?.status || 500
        ).send(error.response?.data?.message || error.message);
    }
};

exports.saveWorkflow = async function(req, res) {
    try {
        const required = [
            "organizationId",
            "workflowName",
            "module",
            "trigger",
            "channel",
            "templateId",
            "recipientField"
        ];

        const missing = required.find(field => !req.body[field]);

        if (missing) {
            return res.status(400).json({
                success: false,
                message: `${missing} is required.`
            });
        }

        const organizationId = String(req.body.organizationId);
        const trigger = String(req.body.trigger).toLowerCase();
        const autoConfigureZoho = req.body.autoConfigureZoho !== false;

        if (!["create", "edit"].includes(trigger)) {
            return res.status(400).json({
                success: false,
                message: "Only Create and Edit triggers are supported."
            });
        }

        const workflow = await WorkflowConfig.findOneAndUpdate(
            {
                organizationId,
                workflowName: req.body.workflowName
            },
            {
                ...req.body,
                organizationId,
                trigger,
                triggerType: trigger,
                enabled: true
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        let zohoSetup = null;

        // Do not create duplicate Zoho automation for an already configured workflow.
        if (
            autoConfigureZoho &&
            !workflow.zohoWebhookId &&
            !workflow.zohoWorkflowRuleId
        ) {
            const tokenData = await zohoOAuthService.getAccessToken(
                organizationId
            );

            zohoSetup = await zohoAutomationService.setupZohoAutomation({
                accessToken: tokenData.accessToken,
                apiDomain: tokenData.apiDomain,
                workflow
            });

            workflow.zohoApiDomain = tokenData.apiDomain;
            workflow.zohoModuleId = zohoSetup.zohoModuleId;
            workflow.zohoWebhookId = zohoSetup.zohoWebhookId;
            workflow.zohoWorkflowRuleId = zohoSetup.zohoWorkflowRuleId;
            workflow.webhookUrl = zohoSetup.webhookUrl;

            await workflow.save();
        }

        return res.status(201).json({
            success: true,
            workflowId: workflow._id,
            workflow,
            zoho: zohoSetup
        });
    } catch (error) {
        console.error("========== SAVE WORKFLOW ERROR ==========");
        console.error("Message:", error.message);
        console.error("Status:", error.response?.status || error.statusCode);
        console.error("Zoho Response:", JSON.stringify(error.response?.data, null, 2));
        console.error("==========================================");

        return res.status(
            error.statusCode || error.response?.status || 500
        ).json({
            success: false,
            message: error.response?.data?.message || error.message,
            zohoError: error.response?.data || null
        });
    }
};

function normalizeTrigger(trigger) {
    const value = String(trigger || "").trim().toLowerCase();

    if (value === "create" || value === "insert") return "create";
    if (value === "edit" || value === "update") return "edit";

    return value;
}

exports.zohoNotification = async function(req, res) {
    res.status(200).json({ success: true, received: true });

    try {
        const payload = req.body || {};
        const channelId = String(payload.channel_id || "");

        if (!channelId) return;

        const workflow = await WorkflowConfig.findOne({
            zohoChannelId: channelId,
            enabled: true
        }).select("+zohoNotificationToken");

        if (!workflow) return;

        if (
            workflow.zohoNotificationToken &&
            payload.token !== workflow.zohoNotificationToken
        ) {
            return;
        }

        const incomingModule = String(payload.module || "");
        if (incomingModule && incomingModule !== workflow.module) return;

        const incomingTrigger = normalizeTrigger(
            payload.operation || payload.trigger || payload.event
        );
        const configuredTrigger = String(
            workflow.triggerType || workflow.trigger
        ).toLowerCase();

        if (
            incomingTrigger &&
            incomingTrigger !== configuredTrigger
        ) {
            return;
        }

        const ids = Array.isArray(payload.ids) ? payload.ids : [];

        for (const recordId of ids) {
            try {
                await workflowService.trigger(workflow._id, {
                    ...payload,
                    recordId,
                    operation: incomingTrigger
                });
            } catch (error) {
                console.error(
                    `Workflow ${workflow._id} failed for record ${recordId}:`,
                    error.response?.data || error.message
                );
            }
        }
    } catch (error) {
        console.error(
            "Zoho notification processing error:",
            error.response?.data || error.message
        );
    }
};

exports.triggerWorkflow = async function(req, res) {
    try {
        const result = await workflowService.trigger(
            req.params.workflowId,
            req.body || {}
        );

        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(
            error.statusCode || error.response?.status || 500
        ).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};

exports.sendWorkflowMessage = async function(req, res) {
    try {
        const result = await workflowService.send(req.body);
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(
            error.statusCode || error.response?.status || 500
        ).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};

exports.getZohoModules = async function(req, res) {
    try {
        const { organizationId } = req.query;

        if (!organizationId) {
            return res.status(400).json({
                success: false,
                message: "organizationId is required."
            });
        }

        const tokenData = await zohoOAuthService.getAccessToken(
            String(organizationId)
        );

        const result = await zohoCrmService.getModules(
            tokenData.accessToken,
            tokenData.apiDomain
        );

        return res.json({
            success: true,
            modules: result.modules || []
        });
    } catch (error) {
        console.error(
            "Get Zoho modules error:",
            error.response?.data || error.message
        );

        return res.status(
            error.statusCode || error.response?.status || 500
        ).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};

exports.getZohoFields = async function(req, res) {
    try {
        const { organizationId, module } = req.query;

        if (!organizationId) {
            return res.status(400).json({
                success: false,
                message: "organizationId is required."
            });
        }

        if (!module) {
            return res.status(400).json({
                success: false,
                message: "module is required."
            });
        }

        const tokenData = await zohoOAuthService.getAccessToken(
            String(organizationId)
        );

        const fields = await zohoCrmService.getFields(
            tokenData.accessToken,
            module,
            tokenData.apiDomain
        );

        return res.json({ success: true, module, fields });
    } catch (error) {
        console.error(
            "Get Zoho fields error:",
            error.response?.data || error.message
        );

        return res.status(
            error.statusCode || error.response?.status || 500
        ).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};
