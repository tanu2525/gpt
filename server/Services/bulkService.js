const messageService = require("./messageService");
const { getBulkConcurrency } = require("../utils/requestValidation");

async function sendOne({
    lead,
    organizationId,
    channel,
    templateId,
    templateName,
    variables
}) {
    const recipient = String(channel).toLowerCase() === "email"
        ? lead.Email
        : (lead.Mobile || lead.Phone);

    if (!recipient) {
        return {
            id: lead.id,
            name: lead.Full_Name,
            status: "skipped",
            error: "No compatible recipient was found."
        };
    }

    const finalVariables = {};
    Object.keys(variables || {}).forEach(key => {
        const field = variables[key];
        finalVariables[key] = lead[field] || "";
    });

    try {
        await messageService.sendMessage({
            organizationId,
            channel,
            recipient,
            templateId,
            templateName,
            variables: finalVariables,
            recordId: lead.id,
            module: "Leads"
        });

        return {
            id: lead.id,
            name: lead.Full_Name,
            status: "accepted"
        };
    } catch (error) {
        return {
            id: lead.id,
            name: lead.Full_Name,
            status: "failed",
            error: error.message
        };
    }
}

async function send(data) {
    const {
        organizationId,
        channel,
        templateId,
        templateName,
        variables = {},
        leads = []
    } = data;

    if (!Array.isArray(leads)) {
        const error = new Error("leads must be an array.");
        error.statusCode = 400;
        throw error;
    }

    const concurrency = getBulkConcurrency(
        data.concurrency || process.env.AUTHKEY_BULK_CONCURRENCY,
        5
    );

    const results = [];

    for (let start = 0; start < leads.length; start += concurrency) {
        const batch = leads.slice(start, start + concurrency);
        const batchResults = await Promise.all(
            batch.map(lead => sendOne({
                lead,
                organizationId,
                channel,
                templateId,
                templateName,
                variables
            }))
        );

        results.push(...batchResults);
    }

    const acceptedCount = results.filter(item => item.status === "accepted").length;
    const failedCount = results.filter(item => item.status === "failed").length;
    const skippedCount = results.filter(item => item.status === "skipped").length;

    return {
        success: failedCount === 0,
        total: leads.length,
        acceptedCount,
        failedCount,
        skippedCount,
        results
    };
}

module.exports = {
    send
};
