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

function getRecipientForChannel(record, channel) {
    return String(channel).toLowerCase() === "email"
        ? record?.Email || null
        : record?.Mobile || record?.Phone || null;
}

function getRecordDisplayName(record, entity = "Leads") {
    if (entity === "Accounts") {
        return record?.Account_Name || record?.id || "Unnamed account";
    }

    if (entity === "Contacts") {
        return record?.Full_Name || record?.Last_Name || record?.First_Name || record?.id || "Unnamed contact";
    }

    return record?.Full_Name || record?.Last_Name || record?.First_Name || record?.id || "Unnamed lead";
}

function getLeadDisplayName(lead) {
    return getRecordDisplayName(lead, "Leads");
}

function resolveFieldVariables(fieldMappings, record) {
    return Object.fromEntries(Object.entries(fieldMappings).map(([variable, fieldApiName]) => [
        variable,
        record?.[fieldApiName] || ""
    ]));
}
