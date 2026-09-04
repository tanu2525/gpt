let recordId = null;
let moduleName = "Leads";
let record = null;
let crmFields = [];

function resolveModuleName(data = {}) {
    const value = data.Entity || data.Module || data.EntityName || "Leads";
    const normalized = String(value).trim().toLowerCase();

    const modules = {
        lead: "Leads",
        leads: "Leads",
        contact: "Contacts",
        contacts: "Contacts",
        account: "Accounts",
        accounts: "Accounts"
    };

    return modules[normalized] || "Leads";
}

function getModuleSingularName() {
    if (moduleName === "Contacts") return "Contact";
    if (moduleName === "Accounts") return "Account";
    return "Lead";
}

ZOHO.embeddedApp.on("PageLoad", async data => {
    try {
        if (!(await ensureAuthkeyConfigured())) return;

        recordId = Array.isArray(data.EntityId)
            ? data.EntityId[0]
            : (data.EntityId || data.RecordID || data.RecordId || data.recordId);
        moduleName = resolveModuleName(data);

        if (!recordId) {
            showError("Unable to determine the CRM record.");
            return;
        }

        record = await getCrmRecord(recordId, moduleName);
        crmFields = await getCrmFields(moduleName);
        updateRecipientLabel();
        await refreshTemplates();
    } catch (error) {
        showError(error.message || "Unable to load the message form.");
    }
});

function showError(message) {
    setStatus(message || "Something went wrong. Please try again.");
}

function updateRecipientLabel() {
    const channel = document.getElementById("channel").value;
    const isEmail = channel === "email";
    const recordName = getModuleSingularName();
    const strongElement = document.querySelector("#leadInfo strong");

    if (strongElement) {
        strongElement.textContent = isEmail ? `${recordName} Email:` : `${recordName} Phone:`;
    }

    const recipientElement = document.getElementById("leadPhoneLabel");
    if (recipientElement) {
        recipientElement.textContent = getRecipientForChannel(record, channel) || (isEmail ? "No email available" : "No phone available");
    }
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
    await resetMessageForm();
    setStatus("Message submitted successfully.");
}

async function resetMessageForm() {
    const channel = document.getElementById("channel");
    const templateSelect = document.getElementById("templateSelect");

    if (channel) channel.selectedIndex = 0;

    if (templateSelect) {
        templateSelect.innerHTML = "";
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Select Template";
        templateSelect.appendChild(option);
    }

    ["variablesContainer", "variableMapping", "variables", "templateVariables"].forEach(id => {
        const container = document.getElementById(id);
        if (container) container.replaceChildren();
    });

    const preview = document.getElementById("templatePreview") || document.getElementById("preview");
    if (preview) preview.value = "";

    updateRecipientLabel();
    await refreshTemplates();
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
