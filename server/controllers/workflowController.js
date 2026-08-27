const workflowService =
    require("../Services/workflowService");

const WorkflowConfig =
    require("../models/WorkflowConfig");
const zohoOAuthService =
    require("../Services/zohoOAuthService");

const zohoCrmService =
    require("../Services/zohoCrmService");
exports.getZohoOAuthUrl =
async function(req, res) {
    try {
        const {
            organizationId
        } = req.query;

        if (!organizationId) {
            return res.status(400).json({
                success: false,
                message:
                    "organizationId is required."
            });
        }

        const url =
            zohoOAuthService.createAuthorizationUrl(
                organizationId
            );

        res.json({
            success: true,
            authorizationUrl: url
        });
    } catch (error) {
        res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message: error.message
        });
    }
};


exports.zohoOAuthCallback =
async function(req, res) {
    try {
        const {
            code,
            state,
            error
        } = req.query;

        if (error) {
            return res.status(400).send(
                `Zoho authorization failed: ${error}`
            );
        }

        if (!code || !state) {
            return res.status(400).send(
                "Zoho authorization code/state is missing."
            );
        }

        const stateData =
            zohoOAuthService.getOrganizationFromState(
                state
            );

        const token =
            await zohoOAuthService.exchangeCode(
                code,
                stateData.redirectUri
            );

        if (!token.refresh_token) {
            return res.status(400).send(
                "Zoho did not return a refresh token. Make sure access_type=offline is used."
            );
        }

        await zohoOAuthService.saveRefreshToken({
            organizationId:
                stateData.organizationId,

            refreshToken:
                token.refresh_token,

            apiDomain:
                token.api_domain,

            scope:
                process.env.ZOHO_SCOPES
        });

        return res.send(
            "Zoho CRM connected successfully. You can close this window."
        );
    } catch (error) {
        console.error(
            "Zoho OAuth callback error:",
            error.response?.data ||
            error.message
        );

        return res.status(
            error.statusCode ||
            error.response?.status ||
            500
        ).send(
            error.response?.data?.message ||
            error.message
        );
    }
};


exports.saveWorkflow =
async function(req, res) {
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

        const missing =
            required.find(
                field =>
                    !req.body[field]
            );

        if (missing) {
            return res.status(400).json({
                success: false,
                message:
                    `${missing} is required.`
            });
        }

        const {
            autoConfigureZoho = false,
            ...workflowData
        } = req.body;

        const organizationId =
            String(
                req.body.organizationId
            );

        /*
         * Save the local workflow first.
         */
        let workflow =
            await WorkflowConfig.findOneAndUpdate(
                {
                    organizationId,
                    workflowName:
                        req.body.workflowName
                },
                {
                    ...workflowData,
                    organizationId,
                    triggerType:
                        req.body.triggerType ||
                        req.body.trigger,
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

      

        return res.status(201).json({
            success: true,
            workflowId:
                workflow._id,
            workflow,
            zoho:
                zohoSetup
        });
    } catch (error) {
       console.error(
    "========== SAVE WORKFLOW ERROR =========="
);

console.error(
    "Message:",
    error.message
);

console.error(
    "Status:",
    error.response?.status || error.statusCode
);

console.error(
    "Zoho Response:",
    JSON.stringify(
        error.response?.data,
        null,
        2
    )
);

console.error(
    "Full Error:",
    error
);

console.error(
    "=========================================="
);

        return res.status(
            error.statusCode ||
            error.response?.status ||
            500
        ).json({
            success: false,
            message:
                error.response?.data?.message ||
                error.message,
            zohoError:
                error.response?.data ||
                null
        });
    }
};


exports.zohoNotification =
async function(req, res) {
    /*
     * Zoho expects a quick 2xx response. We acknowledge
     * first and process asynchronously.
     */
    res.status(200).json({
        success: true,
        received: true
    });

    try {
        const payload =
            req.body || {};

        const channelId =
            String(
                payload.channel_id ||
                ""
            );

        if (!channelId) {
            console.warn(
                "Zoho notification ignored: missing channel_id"
            );
            return;
        }

        const workflow =
            await WorkflowConfig.findOne({
                zohoChannelId:
                    channelId,
                enabled: true
            }).select(
                "+zohoNotificationToken"
            );

        if (!workflow) {
            console.warn(
                "No workflow found for Zoho channel:",
                channelId
            );
            return;
        }

        /*
         * Validate Zoho's token.
         */
        if (
            workflow.zohoNotificationToken &&
            payload.token !==
            workflow.zohoNotificationToken
        ) {
            console.warn(
                "Invalid Zoho notification token for channel:",
                channelId
            );
            return;
        }

        const incomingModule =
            String(
                payload.module ||
                ""
            );

        if (
            incomingModule &&
            incomingModule !==
            workflow.module
        ) {
            console.warn(
                "Zoho notification module mismatch:",
                incomingModule,
                workflow.module
            );
            return;
        }

        const incomingTrigger =
            zohoNotificationService
                .operationToTrigger(
                    payload.operation
                );

        const configuredTrigger =
            String(
                workflow.triggerType ||
                workflow.trigger
            ).toLowerCase();

        if (
            configuredTrigger !== "all" &&
            configuredTrigger !== "create_or_edit" &&
            incomingTrigger !==
            configuredTrigger
        ) {
            console.warn(
                "Zoho notification trigger mismatch:",
                incomingTrigger,
                configuredTrigger
            );
            return;
        }

        const ids =
            Array.isArray(payload.ids)
                ? payload.ids
                : [];

        if (!ids.length) {
            console.warn(
                "Zoho notification contained no record IDs."
            );
            return;
        }

        /*
         * One Zoho notification can contain more than one
         * affected record. Process each independently.
         */
        for (const recordId of ids) {
            try {
                await workflowService.trigger(
                    workflow._id,
                    {
                        ...payload,
                        recordId,
                        operation:
                            payload.operation
                    }
                );
            } catch (error) {
                console.error(
                    `Workflow ${workflow._id} failed for record ${recordId}:`,
                    error.response?.data ||
                    error.message
                );
            }
        }
    } catch (error) {
        console.error(
            "Zoho notification processing error:",
            error.response?.data ||
            error.message
        );
    }
};


exports.triggerWorkflow =
async function(req, res) {
    try {
        const result =
            await workflowService.trigger(
                req.params.workflowId,
                req.body || {}
            );

        return res.json({
            success: true,
            ...result
        });
    } catch (error) {
        return res.status(
            error.statusCode ||
            error.response?.status ||
            500
        ).json({
            success: false,
            message:
                error.response?.data?.message ||
                error.message
        });
    }
};


exports.sendWorkflowMessage =
async function(req, res) {
    try {
        const result =
            await workflowService.send(
                req.body
            );

        return res.json({
            success: true,
            ...result
        });
    } catch (error) {
        return res.status(
            error.statusCode ||
            error.response?.status ||
            500
        ).json({
            success: false,
            message:
                error.response?.data?.message ||
                error.message
        });
    }
};

exports.getZohoModules = async function(req, res) {
    try {
        const accessToken =
            req.headers.authorization?.replace(
                "Bearer ",
                ""
            );

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "Zoho access token is required."
            });
        }

        const result =
            await zohoCrmService.getModules(
                accessToken
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
            error.response?.status || 500
        ).json({
            success: false,
            message:
                error.response?.data?.message ||
                error.message
        });
    }
};

exports.getZohoFields = async function(req, res) {
    try {
        const {
            organizationId,
            module
        } = req.query;

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

        const tokenData =
            await zohoOAuthService.getAccessToken(
                organizationId
            );

        const fields =
            await zohoCrmService.getFields(
                tokenData.accessToken,
                module
            );

        return res.json({
            success: true,
            module,
            fields
        });

    } catch (error) {
        console.error(
            "Get Zoho fields error:",
            error.response?.data || error.message
        );

        return res.status(
            error.statusCode ||
            error.response?.status ||
            500
        ).json({
            success: false,
            message:
                error.response?.data?.message ||
                error.message
        });
    }
};
//delete later
exports.testOAuth = async (req, res) => {
    const organizationId = "4599126000000295996";

    const url =
        zohoOAuthService.createAuthorizationUrl(organizationId);

    res.send(`
        <h2>Zoho Sandbox OAuth</h2>
        <a href="${url}" target="_blank">
            Connect Sandbox CRM
        </a>
    `);
};