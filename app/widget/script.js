let recordId = null;
let moduleName = "Leads";
let record = null;
let crmFields = [];

ZOHO.embeddedApp.on("PageLoad", async data => {
    recordId = Array.isArray(data.EntityId) ? data.EntityId[0] : (data.EntityId || data.RecordID || data.RecordId || data.recordId);
    moduleName = data.Entity || data.Module || "Leads";

    if (!recordId) {
        showError("Unable to determine Record ID.");
        return;
    }

    try {
        record = await getCrmRecord(recordId, moduleName);
        crmFields = await getCrmFields(moduleName);
        updateRecipientLabel();
        await refreshTemplates();
    } catch (error) {
        console.error(error);
        showError(error.message);
    }
});

function showError(message) {
    setStatus(message);
    document.getElementById("configureAuthkey").hidden = !/credentials have not been configured/i.test(message);
}

function updateRecipientLabel() {
    const channel = document.getElementById("channel").value;
    const isEmail = channel === "email";
    document.querySelector("#leadInfo strong").textContent = isEmail ? "Lead Email:" : "Lead Phone:";
    document.getElementById("leadPhoneLabel").textContent = getRecipientForChannel(record, channel) || (isEmail ? "No Email" : "No Phone");
}

function previewSelectedTemplate() {
    previewTemplate({ renderVariables: body => renderFieldVariableSelectors(body, crmFields) });
}

async function refreshTemplates() {
    await loadTemplates();
    previewSelectedTemplate();
}

async function sendMessage() {
    const channel = document.getElementById("channel").value;
    const recipient = getRecipientForChannel(record, channel);
    const templateId = document.getElementById("templateSelect").value;

    if (!recipient) throw new Error("This record has no usable recipient.");
    if (!templateId) throw new Error("Choose a template first.");

    const variables = resolveFieldVariables(collectTemplateVariables(), record);
    const result = await requestJson("/api/message/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            organizationId: await getOrganizationId(),
            channel,
            recipient,
            templateId,
            variables: channel === "sms" ? normalizeSmsVariables(variables) : variables,
            recordId,
            module: moduleName
        })
    });

    await createDeliveryNote(channel, recipient, templateId, result);
    setStatus("Message submitted successfully.");
}

async function createDeliveryNote(channel, recipient, templateId, response) {
    const templateName = document.getElementById("templateSelect").selectedOptions[0]?.textContent || "";
    const noteContent = `Channel : ${channel}\nRecipient : ${recipient}\nTemplate : ${templateName}\nTemplate ID : ${templateId}\nStatus : Submitted Successfully\n\nProvider Response :\n${response.Message || response.message || "No message"}\n\nLog ID :\n${response.LogID || response.LogId || response.message_id || ""}`;

    await ZOHO.CRM.API.insertRecord({
        Entity: "Notes",
        APIData: {
            Note_Title: `${channel.toUpperCase()} Message`,
            Note_Content: noteContent,
            Parent_Id: recordId,
            se_module: moduleName
        }
    });
}

document.getElementById("channel").addEventListener("change", () => {
    updateRecipientLabel();
    refreshTemplates().catch(error => showError(error.message));
});
document.getElementById("templateSelect").addEventListener("change", previewSelectedTemplate);
document.getElementById("sendBtn").addEventListener("click", () => sendMessage().catch(error => showError(error.message)));
ZOHO.embeddedApp.init();
