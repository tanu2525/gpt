const axios = require("axios");

const messageService =
require("./messageService");
const WorkflowConfig = require("../models/WorkflowConfig");

async function fetchLead(
    recordId,
    module,
    accessToken
){

    const response =
    await axios.get(

        `https://www.zohoapis.com/crm/v7/${module}/${recordId}`,
        {

            headers:{

                Authorization:
                `Zoho-oauthtoken ${accessToken}`

            }

        }

    );

    return response.data.data[0];

}

exports.send =
async function(data){

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

    const record =
    await fetchLead(

        recordId,
        module,
        accessToken

    );

    const recipient =
    channel==="email"

        ? record.Email

        : (
            record.Mobile
            ||
            record.Phone
        );

    return await messageService.sendMessage({

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

exports.trigger = async function(workflowId, payload) {
    const workflow = await WorkflowConfig.findOne({ _id: workflowId, enabled: true });
    if (!workflow) {
        const error = new Error("Workflow was not found or is disabled.");
        error.statusCode = 404;
        throw error;
    }

    const record = payload.record && typeof payload.record === "object" ? payload.record : payload;
    const recipient = record[workflow.recipientField] || payload.recipient;
    if (!recipient) {
        const error = new Error(`The webhook did not include the ${workflow.recipientField} recipient field.`);
        error.statusCode = 400;
        throw error;
    }

    const variables = Object.fromEntries(
        Object.entries(workflow.variables || {}).map(([name, field]) => [name, record[field] ?? ""])
    );
    const message = {
        organizationId: workflow.organizationId,
        channel: workflow.channel,
        recipient,
        templateId: workflow.templateId,
        templateName: workflow.templateName,
        recordId: payload.recordId || record.id || record.Id,
        module: workflow.module,
        variables
    };

    try {
        const sent = await messageService.sendMessage(message);
        return { workflowId: workflow._id, logId: sent.log._id, channel: workflow.channel };
    } catch (primaryError) {
        if (!workflow.fallbackChannel || workflow.fallbackChannel === workflow.channel) throw primaryError;
        const sent = await messageService.sendMessage({ ...message, channel: workflow.fallbackChannel });
        return { workflowId: workflow._id, logId: sent.log._id, channel: workflow.fallbackChannel, fallbackUsed: true, primaryError: primaryError.message };
    }
};
