let selectedIds = [];
let selectedRecords = [];
let crmFields = [];
let currentModule = "Leads";

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

function getSelectedRecordIds(data = {}) {
    const ids = data.EntityId || data.EntityIds || data.RecordID || data.RecordId || [];
    return Array.isArray(ids) ? ids : (ids ? [ids] : []);
}

function getModuleLabel() {
    return currentModule === "Accounts" ? "Accounts" : currentModule;
}

ZOHO.embeddedApp.on("PageLoad", async data => {
    try {
        if (!(await ensureAuthkeyConfigured())) return;

        currentModule = resolveModuleName(data);
        selectedIds = getSelectedRecordIds(data);
        setRecordCount(selectedIds.length, getModuleLabel());

        crmFields = await getCrmFields(currentModule);
        selectedRecords = await getCrmRecords(selectedIds, currentModule);
        await refreshTemplates();
        renderRecordList();
        updateSummary();
    } catch (error) {
        console.error(error);
        setStatus(error.message, "progress");
    }
});

function previewSelectedTemplate() {
    previewTemplate({ renderVariables: body => renderFieldVariableSelectors(body, crmFields) });
}

async function refreshTemplates() {
    await loadTemplates();
    previewSelectedTemplate();
}

async function sendBulkMessages() {
    const channel = document.getElementById("channel").value;
    const selectedTemplate = document.getElementById("templateSelect").selectedOptions[0];
    const records = selectedRecords.filter(record => getRecipientForChannel(record, channel));

    if (!selectedTemplate?.value) throw new Error("Choose a template first.");
    if (!records.length) throw new Error(`No selected ${currentModule} records have a compatible recipient.`);

    const result = await requestJson("/api/bulk/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            organizationId: await getOrganizationId(),
            module: currentModule,
            channel,
            templateId: selectedTemplate.value,
            templateName: selectedTemplate.textContent,
            variables: collectTemplateVariables(),
            records
        })
    });

    renderProgress(result);
    await resetBulkForm();
}

async function resetBulkForm() {
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

    const preview = document.getElementById("preview") || document.getElementById("templatePreview");
    if (preview) preview.value = "";

    await refreshTemplates();
    renderRecordList();
    updateSummary();
}

function renderRecordList() {
    const channel = document.getElementById("channel").value;
    const list = document.getElementById("leadList") || document.getElementById("recordList");
    if (!list) return;

    list.replaceChildren();

    selectedRecords.forEach((record, index) => {
        const item = document.createElement("div");
        item.className = "lead-item";
        const header = document.createElement("div");
        header.className = "lead-header";
        const name = document.createElement("b");
        name.textContent = getRecordDisplayName(record, currentModule);
        const removeButton = document.createElement("button");
        removeButton.className = "removeBtn";
        removeButton.textContent = "×";
        removeButton.addEventListener("click", () => removeRecord(index));
        const contact = document.createElement("div");
        contact.textContent = getRecipientForChannel(record, channel) || "-";
        header.append(name, removeButton);
        item.append(header, contact);
        list.appendChild(item);
    });
}

function updateSummary() {
    const channel = document.getElementById("channel").value;
    const valid = selectedRecords.filter(record => getRecipientForChannel(record, channel)).length;
    const summary = document.getElementById("summary");
    if (summary) summary.textContent = `Valid: ${valid} | Missing contact: ${selectedRecords.length - valid}`;

    const sendButton = document.getElementById("sendBtn");
    if (sendButton) {
        sendButton.disabled = valid === 0;
        sendButton.textContent = `Send to Selected ${currentModule}`;
    }
}

function removeRecord(index) {
    selectedRecords.splice(index, 1);
    selectedIds.splice(index, 1);
    setRecordCount(selectedRecords.length, getModuleLabel());
    renderRecordList();
    updateSummary();
}

function renderProgress(result) {
    const progress = document.getElementById("progress");
    if (!progress) return;

    progress.replaceChildren();
    progress.append(`Bulk Send Completed — Total: ${result.total}, Sent: ${result.acceptedCount || result.successCount || 0}, Failed: ${result.failedCount || 0}, Skipped: ${result.skippedCount || 0}`);

    (result.results || []).forEach(item => {
        const row = document.createElement("div");
        row.textContent = `${item.name} — ${item.status}`;
        progress.appendChild(row);
    });
}

document.getElementById("channel").addEventListener("change", () => {
    refreshTemplates()
        .then(() => { renderRecordList(); updateSummary(); })
        .catch(error => setStatus(error.message, "progress"));
});
document.getElementById("templateSelect").addEventListener("change", previewSelectedTemplate);
document.getElementById("sendBtn").addEventListener("click", () => sendBulkMessages().catch(error => setStatus(error.message, "progress")));
ZOHO.embeddedApp.init();
