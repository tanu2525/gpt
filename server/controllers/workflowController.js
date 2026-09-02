const crypto = require("crypto");

const workflowService = require("../Services/workflowService");
const WorkflowConfig = require("../models/WorkflowConfig");
const zohoOAuthService = require("../Services/zohoOAuthService");
const zohoCrmService = require("../Services/zohoCrmService");
const zohoAutomationService = require("../Services/zohoAutomationService");

const ALLOWED_MODULES = [
    "Leads",
    "Contacts",
    "Accounts",
    "Deals",
    "Tasks"
];

function generateWebhookSecret() {
    return crypto.randomBytes(32).toString("hex");
}

function hashWebhookSecret(secret) {
    return crypto.createHash("sha256").update(secret).digest("hex");
}

function verifyWebhookSecret(secret, expectedHash) {
    if (!secret || !expectedHash) return false;

    const receivedHash = hashWebhookSecret(secret);
    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const receivedBuffer = Buffer.from(receivedHash, "hex");

    if (expectedBuffer.length !== receivedBuffer.length) return false;

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

exports.getZohoOAuthUrl = async function(req, res) {
    try {
        const { organizationId, apiDomain } = req.query;

        if (!organizationId) {
            return res.status(400).json({ success: false, message: "organizationId is required." });
        }

        return res.json({
            success: true,
            authorizationUrl: zohoOAuthService.createAuthorizationUrl(
                String(organizationId),
                apiDomain
            )
        });
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

        if (error) return res.status(400).send(`Zoho authorization failed: ${error}`);
        if (!code || !state) {
            return res.status(400).send("Zoho authorization code/state is missing.");
        }

        const stateData = zohoOAuthService.getOrganizationFromState(state);
        const token = await zohoOAuthService.exchangeCode(
            code,
            stateData.redirectUri,
            stateData.accountsDomain
        );

        if (!token.refresh_token) {
            return res.status(400).send(
                "Zoho did not return a refresh token. Make sure access_type=offline is used."
            );
        }

        await zohoOAuthService.saveRefreshToken({
            organizationId: stateData.organizationId,
            refreshToken: token.refresh_token,
            apiDomain: stateData.crmApiDomain,
            scope: process.env.ZOHO_SCOPES
        });

        return res.send("Zoho CRM connected successfully. You can close this window.");
    } catch (error) {
        console.error("Zoho OAuth callback error:", error.response?.data || error.message);
        return res.status(error.statusCode || error.response?.status || 500)
            .send(error.response?.data?.message || error.message);
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
            return res.status(400).json({ success: false, message: `${missing} is required.` });
        }

        const organizationId = String(req.body.organizationId);
        const trigger = String(req.body.trigger).trim().toLowerCase();
        const module = String(req.body.module).trim();

        if (!ALLOWED_MODULES.includes(module)) {
            return res.status(400).json({
                success: false,
                message: `Supported modules are: ${ALLOWED_MODULES.join(", ")}.`
            });
        }

        if (!["create", "edit"].includes(trigger)) {
            return res.status(400).json({
                success: false,
                message: "Only Create and Edit triggers are supported."
            });
        }

        const existingWorkflow = await WorkflowConfig.findOne({
            organizationId,
            workflowName: req.body.workflowName
        }).select("+webhookSecretHash");

        let webhookSecret = null;
        let webhookSecretHash = existingWorkflow?.webhookSecretHash || null;

        if (!webhookSecretHash) {
            webhookSecret = generateWebhookSecret();
            webhookSecretHash = hashWebhookSecret(webhookSecret);
        }

        const workflow = await WorkflowConfig.findOneAndUpdate(
            { organizationId, workflowName: req.body.workflowName },
            {
                ...req.body,
                organizationId,
                module,
                trigger,
                triggerType: trigger,
                enabled: true,
                webhookSecretHash
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        let zohoSetup = null;

        if (req.body.autoConfigureZoho !== false) {
            const tokenData = await zohoOAuthService.getAccessToken(organizationId);

            if (!workflow.zohoWebhookId || !workflow.zohoWorkflowRuleId) {
                if (!webhookSecret) {
                    webhookSecret = generateWebhookSecret();
                    workflow.webhookSecretHash = hashWebhookSecret(webhookSecret);
                    await workflow.save();
                }

                zohoSetup = await zohoAutomationService.setupZohoAutomation({
                    accessToken: tokenData.accessToken,
                    apiDomain: tokenData.apiDomain,
                    workflow,
                    webhookSecret
                });

                workflow.zohoApiDomain = tokenData.apiDomain;
                workflow.zohoModuleId = zohoSetup.zohoModuleId;
                workflow.zohoWebhookId = zohoSetup.zohoWebhookId;
                workflow.zohoWorkflowRuleId = zohoSetup.zohoWorkflowRuleId;
                workflow.webhookUrl = zohoSetup.webhookUrl;
                await workflow.save();
            } else {
                // Existing Zoho automation remains linked to this workflow.
                // Updating the actual Zoho rule/webhook configuration is a separate
                // operation so that an existing working automation is not silently broken.
                workflow.zohoApiDomain = tokenData.apiDomain;
                await workflow.save();
                zohoSetup = {
                    zohoModuleId: workflow.zohoModuleId,
                    zohoWebhookId: workflow.zohoWebhookId,
                    zohoWorkflowRuleId: workflow.zohoWorkflowRuleId,
                    webhookUrl: workflow.webhookUrl
                };
            }
        }

        const workflowResponse = workflow.toObject();
        delete workflowResponse.webhookSecretHash;

        return res.status(201).json({
            success: true,
            workflowId: workflow._id,
            workflow: workflowResponse,
            zoho: zohoSetup
        });
    } catch (error) {
        console.error("========== SAVE WORKFLOW ERROR ==========");
        console.error("Message:", error.message);
        console.error("Status:", error.response?.status || error.statusCode);
        console.error("Zoho Response:", JSON.stringify(error.response?.data, null, 2));
        console.error("==========================================");

        return res.status(error.statusCode || error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || error.message,
            zohoError: error.response?.data || null
        });
    }
};

exports.triggerWorkflow = async function(req, res) {
    try {
        const workflow = await WorkflowConfig.findById(req.params.workflowId)
            .select("+webhookSecretHash");

        if (!workflow || !workflow.enabled) {
            return res.status(404).json({
                success: false,
                message: "Workflow not found or disabled."
            });
        }

        const receivedSecret = req.get("X-Workflow-Secret");

        if (!verifyWebhookSecret(receivedSecret, workflow.webhookSecretHash)) {
            return res.status(401).json({
                success: false,
                message: "Workflow webhook is not authorized."
            });
        }

        const result = await workflowService.trigger(workflow._id, req.body || {});
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(error.statusCode || error.response?.status || 500).json({
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
        return res.status(error.statusCode || error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};

exports.getZohoModules = async function(req, res) {
    try {
        const { organizationId } = req.query;
        if (!organizationId) {
            return res.status(400).json({ success: false, message: "organizationId is required." });
        }

        const tokenData = await zohoOAuthService.getAccessToken(String(organizationId));
        const modules = await zohoCrmService.getModules(
            tokenData.accessToken,
            tokenData.apiDomain
        );

        return res.json({
            success: true,
            modules: modules.filter(module => ALLOWED_MODULES.includes(module.api_name))
        });
    } catch (error) {
        console.error("Get Zoho modules error:", error.response?.data || error.message);
        return res.status(error.statusCode || error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};

exports.getZohoFields = async function(req, res) {
    try {
        const { organizationId, module } = req.query;

        if (!organizationId) {
            return res.status(400).json({ success: false, message: "organizationId is required." });
        }

        if (!module) {
            return res.status(400).json({ success: false, message: "module is required." });
        }

        if (!ALLOWED_MODULES.includes(module)) {
            return res.status(400).json({
                success: false,
                message: `Supported modules are: ${ALLOWED_MODULES.join(", ")}.`
            });
        }

        const tokenData = await zohoOAuthService.getAccessToken(String(organizationId));
        const fields = await zohoCrmService.getFields(
            tokenData.accessToken,
            module,
            tokenData.apiDomain
        );

        return res.json({ success: true, module, fields });
    } catch (error) {
        console.error("Get Zoho fields error:", error.response?.data || error.message);
        return res.status(error.statusCode || error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};
