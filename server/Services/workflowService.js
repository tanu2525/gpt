const axios = require("axios");

const messageService =
    require("./messageService");

const WorkflowConfig =
    require("../models/WorkflowConfig");



async function fetchRecord(
    recordId,
    module,
    accessToken,
    apiDomain
) {
    if (!recordId) {
        throw new Error(
            "Zoho recordId is required."
        );
    }

    if (!module) {
        throw new Error(
            "Zoho module is required."
        );
    }

    const response =
        await axios.get(
            `${String(
                apiDomain ||
                "https://www.zohoapis.com"
            ).replace(/\/$/, "")}/crm/v8/${encodeURIComponent(module)}/${encodeURIComponent(recordId)}`,
            {
                headers: {
                    Authorization:
                        `Zoho-oauthtoken ${accessToken}`
                }
            }
        );

    return response.data?.data?.[0];
}

function getRecordId(payload) {
    return (
        payload.recordId ||
        payload.id ||
        payload.record?.id ||
        payload.record?.Id ||
        payload.ids?.[0]
    );
}

async function resolveAccessToken(organizationId, accessToken) {
    if (!accessToken) {
        throw new Error(
            "Zoho OAuth access token is required."
        );
    }

    return {
        accessToken,
        apiDomain:
            process.env.ZOHO_API_DOMAIN ||
            "https://www.zohoapis.com"
    };
}

exports.send =
async function(data) {
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

    const tokenData =
        await resolveAccessToken(
            organizationId,
            accessToken
        );

    const record =
        await fetchRecord(
            recordId,
            module,
            tokenData.accessToken,
            tokenData.apiDomain
        );

    if (!record) {
        throw new Error(
            `Zoho record ${recordId} was not found.`
        );
    }

    const recipient =
        String(channel).toLowerCase() === "email"
            ? record.Email
            : (
                record.Mobile ||
                record.Phone
            );

    if (!recipient) {
        throw new Error(
            `No recipient was found in the Zoho ${module} record.`
        );
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

exports.trigger =
async function(workflowId, payload) {
    const workflow =
        await WorkflowConfig.findOne({
            _id: workflowId,
            enabled: true
        }).select("+zohoNotificationToken");

    if (!workflow) {
        const error =
            new Error(
                "Workflow was not found or is disabled."
            );

        error.statusCode = 404;
        throw error;
    }

    const record =
        payload.record &&
        typeof payload.record === "object"
            ? payload.record
            : payload;

    let recipient =
        record[workflow.recipientField] ||
        payload.recipient;

    /*
     * For create/edit notifications, Zoho only gives us
     * record IDs in the notification callback. Fetch the
     * complete record before sending.
     */
    const recordId =
        getRecordId(payload);

    const operation =
        String(
            payload.operation || ""
        ).toLowerCase();

   
    if (!recipient) {
        const error =
            new Error(
                `The workflow could not find ${workflow.recipientField} for Zoho ${workflow.module} ${operation || "event"} ${recordId || ""}.`
            );

        error.statusCode = 400;
        throw error;
    }

    const variables =
        Object.fromEntries(
            Object.entries(
                workflow.variables || {}
            ).map(
                ([name, field]) => [
                    name,
                    record[field] ?? ""
                ]
            )
        );

    const message = {
        organizationId:
            workflow.organizationId,

        channel:
            String(
                workflow.channel
            ).toLowerCase(),

        recipient,

        templateId:
            workflow.templateId,

        templateName:
            workflow.templateName,

        recordId,

        module:
            workflow.module,

        variables
    };

    try {
        const sent =
            await messageService.sendMessage(
                message
            );

        return {
            workflowId:
                workflow._id,

            logId:
                sent.log?._id,

            channel:
                workflow.channel
        };
    } catch (primaryError) {
        if (
            !workflow.fallbackChannel ||
            String(
                workflow.fallbackChannel
            ).toLowerCase() ===
            String(
                workflow.channel
            ).toLowerCase()
        ) {
            throw primaryError;
        }

        const sent =
            await messageService.sendMessage({
                ...message,
                channel:
                    workflow.fallbackChannel
            });

        return {
            workflowId:
                workflow._id,

            logId:
                sent.log?._id,

            channel:
                workflow.fallbackChannel,

            fallbackUsed: true,

            primaryError:
                primaryError.message
        };
    }
};

exports.fetchRecord = fetchRecord;
