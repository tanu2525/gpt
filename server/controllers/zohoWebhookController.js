const crypto = require("crypto");

const WorkflowConfig =
    require("../models/WorkflowConfig");

const workflowService =
    require("../Services/workflowService");


function verifyWebhookSecret(req) {
    const expected =
        process.env.WORKFLOW_WEBHOOK_SECRET;

    const received =
        req.get("X-Workflow-Secret");

    if (!expected || !received) {
        return false;
    }

    const expectedBuffer =
        Buffer.from(expected);

    const receivedBuffer =
        Buffer.from(received);

    if (
        expectedBuffer.length !==
        receivedBuffer.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
    );
}


function normalizeTrigger(trigger) {
    const value =
        String(trigger || "")
            .trim()
            .toLowerCase();

    if (
        value === "create" ||
        value === "insert"
    ) {
        return "create";
    }

    if (
        value === "edit" ||
        value === "update"
    ) {
        return "edit";
    }

    if (
        value === "delete" ||
        value === "remove"
    ) {
        return "delete";
    }

    return value;
}


function getOrganizationId(body) {
    return (
        body.organizationId ||
        body.organization_id ||
        body.orgId ||
        body.org_id
    );
}


function getModule(body) {
    return (
        body.module ||
        body.moduleName ||
        body.module_name
    );
}


function getRecordId(body) {
    return (
        body.recordId ||
        body.record_id ||
        body.id ||
        body.record?.id ||
        body.record?.Id ||
        body.ids?.[0]
    );
}


function getTrigger(body) {
    return normalizeTrigger(
        body.trigger ||
        body.operation ||
        body.event ||
        body.eventType
    );
}


exports.receiveWebhook =
    async (req, res) => {

        /*
         * 1. Verify webhook secret
         */
        if (!verifyWebhookSecret(req)) {
            return res.status(401).json({
                success: false,
                message:
                    "Zoho webhook is not authorized."
            });
        }


        try {
            console.log(
                "\n========== ZOHO WEBHOOK RECEIVED =========="
            );

            console.log(
                "Method:",
                req.method
            );

            console.log(
                "Headers:",
                {
                    "x-workflow-secret":
                        req.get(
                            "X-Workflow-Secret"
                        )
                            ? "[present]"
                            : "[missing]",

                    "content-type":
                        req.get("Content-Type")
                }
            );

            console.log(
                "Body:",
                JSON.stringify(
                    req.body,
                    null,
                    2
                )
            );

            console.log(
                "===========================================\n"
            );


            /*
             * 2. Read Zoho webhook data
             */
            const body =
                req.body || {};

            const organizationId =
                getOrganizationId(body);

            const module =
                getModule(body);

            const recordId =
                getRecordId(body);

            const trigger =
                getTrigger(body);


            /*
             * 3. Validate required webhook data
             */
            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "organizationId is required."
                });
            }

            if (!module) {
                return res.status(400).json({
                    success: false,
                    message:
                        "module is required."
                });
            }

            if (!trigger) {
                return res.status(400).json({
                    success: false,
                    message:
                        "trigger/operation is required."
                });
            }


            /*
             * 4. Find matching workflow
             */
            const workflow =
                await WorkflowConfig.findOne({
                    organizationId,
                    module,
                    enabled: true,

                    $or: [
                        {
                            trigger:
                                trigger
                        },
                        {
                            triggerType:
                                trigger
                        },
                        {
                            triggerType:
                                "all"
                        }
                    ]
                });


            /*
             * 5. No workflow configured
             */
            if (!workflow) {

                console.log(
                    "No matching workflow found:",
                    {
                        organizationId,
                        module,
                        trigger
                    }
                );

                return res.status(200).json({
                    success: true,
                    processed: false,
                    message:
                        "No matching workflow found."
                });
            }


            console.log(
                "Matched workflow:",
                workflow._id.toString()
            );


            /*
             * 6. Trigger workflow
             */
            const result =
                await workflowService.trigger(
                    workflow._id,
                    {
                        ...body,

                        organizationId,

                        module,

                        recordId,

                        operation:
                            trigger
                    }
                );


            /*
             * 7. Success response
             */
            return res.status(200).json({
                success: true,
                processed: true,

                workflowId:
                    workflow._id,

                result
            });

        } catch (error) {

            console.error(
                "Zoho webhook error:",
                error
            );

            return res.status(
                error.statusCode || 500
            ).json({
                success: false,

                message:
                    error.message ||
                    "Failed to process Zoho webhook."
            });
        }
    };