const messageService = require("./messageService");
const { getBulkConcurrency } = require("../utils/requestValidation");

function getRecordName(record, module) {
    if (module === "Accounts") {
        return record.Account_Name || record.id || "Unnamed account";
    }

    if (module === "Contacts") {
        return record.Full_Name || record.Last_Name || record.First_Name || record.id || "Unnamed contact";
    }

    return record.Full_Name || record.Last_Name || record.First_Name || record.id || "Unnamed lead";
}

async function sendOne({
    record,
    organizationId,
    module,
    channel,
    templateId,
    templateName,
    variables
}) {
    const recipient = String(channel).toLowerCase() === "email"
        ? record.Email
        : (record.Mobile || record.Phone);

    const name = getRecordName(record, module);

    if (!recipient) {
        return {
            id: record.id,
            name,
            status: "skipped",
            error: "No compatible recipient was found."
        };
    }

    const finalVariables = {};
    Object.keys(variables || {}).forEach(key => {
        const field = variables[key];
        finalVariables[key] = record[field] || "";
    });

    try {
        await messageService.sendMessage({
            organizationId,
            channel,
            recipient,
            templateId,
            templateName,
            variables: finalVariables,
            recordId: record.id,
            module
        });

        return {
            id: record.id,
            name,
            status: "accepted"
        };
    } catch (error) {
        return {
            id: record.id,
            name,
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
        module = "Leads",
        records = data.leads || []
    } = data;

    const supportedModules = ["Leads", "Contacts", "Accounts"];

    if (!supportedModules.includes(module)) {
        const error = new Error("module must be Leads, Contacts, or Accounts.");
        error.statusCode = 400;
        throw error;
    }

    if (!Array.isArray(records)) {
        const error = new Error("records must be an array.");
        error.statusCode = 400;
        throw error;
    }

    const concurrency = getBulkConcurrency(
        data.concurrency || process.env.AUTHKEY_BULK_CONCURRENCY,
        5
    );

    const results = [];

    for (let start = 0; start < records.length; start += concurrency) {
        const batch = records.slice(start, start + concurrency);
        const batchResults = await Promise.all(
            batch.map(record => sendOne({
                record,
                organizationId,
                module,
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
        module,
        total: records.length,
        acceptedCount,
        failedCount,
        skippedCount,
        results
    };
}

module.exports = {
    send
};
