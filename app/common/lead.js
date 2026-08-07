async function getCrmRecord(recordId, entity = "Leads") {
    const response = await ZOHO.CRM.API.getRecord({
        Entity: entity,
        RecordID: String(recordId)
    });

    if (!response?.data?.length) {
        throw new Error("Record not found.");
    }

    return response.data[0];
}

async function getCrmRecords(recordIds, entity = "Leads") {
    return Promise.all(recordIds.map(recordId => getCrmRecord(recordId, entity)));
}

async function getCrmFields(entity = "Leads") {
    const response = await ZOHO.CRM.META.getFields({ Entity: entity });
    return response.fields || [];
}

function getRecipientForChannel(lead, channel) {
    return channel === "email"
        ? lead?.Email || null
        : lead?.Mobile || lead?.Phone || null;
}

function getLeadDisplayName(lead) {
    return lead?.Full_Name || lead?.Last_Name || lead?.id || "Unnamed lead";
}

function resolveFieldVariables(fieldMappings, lead) {
    return Object.fromEntries(Object.entries(fieldMappings).map(([variable, fieldApiName]) => [
        variable,
        lead?.[fieldApiName] || ""
    ]));
}
