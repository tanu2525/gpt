let selectedIds = [];
let selectedLeads = [];
let crmFields = [];

ZOHO.embeddedApp.on("PageLoad", async data => {
    selectedIds = Array.isArray(data.EntityId) ? data.EntityId : (data.EntityId ? [data.EntityId] : []);
    setLeadCount(selectedIds.length);

    try {
        crmFields = await getCrmFields();
        selectedLeads = await getCrmRecords(selectedIds);
        await refreshTemplates();
        renderLeadList();
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
    const leads = selectedLeads.filter(lead => getRecipientForChannel(lead, channel));

    if (!selectedTemplate?.value) throw new Error("Choose a template first.");

    const result = await requestJson("/api/bulk/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            organizationId: await getOrganizationId(),
            channel,
            templateId: selectedTemplate.value,
            templateName: selectedTemplate.textContent,
            variables: collectTemplateVariables(),
            leads
        })
    });

    renderProgress(result);
    resetBulkForm();
}

function resetBulkForm() {
    const channel = document.getElementById("channel");
    const templateSelect = document.getElementById("templateSelect");

    if (channel) {
        channel.selectedIndex = 0;
    }

    if (templateSelect) {
        templateSelect.innerHTML = "";
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Select Template";
        templateSelect.appendChild(option);
    }

    // Clear variable mapping controls without reloading the Zoho widget.
    ["variablesContainer", "variableMapping", "variables", "templateVariables"].forEach(id => {
        const container = document.getElementById(id);
        if (container) container.replaceChildren();
    });

    const preview = document.getElementById("templatePreview");
    if (preview) preview.value = "";
}

function renderLeadList() {
    const channel = document.getElementById("channel").value;
    const list = document.getElementById("leadList");
    list.replaceChildren();

    selectedLeads.forEach((lead, index) => {
        const item = document.createElement("div");
        item.className = "lead-item";
        const header = document.createElement("div");
        header.className = "lead-header";
        const name = document.createElement("b");
        name.textContent = getLeadDisplayName(lead);
        const removeButton = document.createElement("button");
        removeButton.className = "removeBtn";
        removeButton.textContent = "×";
        removeButton.addEventListener("click", () => removeLead(index));
        const contact = document.createElement("div");
        contact.textContent = getRecipientForChannel(lead, channel) || "-";
        header.append(name, removeButton);
        item.append(header, contact);
        list.appendChild(item);
    });
}

function updateSummary() {
    const channel = document.getElementById("channel").value;
    const valid = selectedLeads.filter(lead => getRecipientForChannel(lead, channel)).length;
    const summary = document.getElementById("summary");
    summary.textContent = `Valid: ${valid} | Missing contact: ${selectedLeads.length - valid}`;
    document.getElementById("sendBtn").disabled = valid === 0;
}

function removeLead(index) {
    selectedLeads.splice(index, 1);
    selectedIds.splice(index, 1);
    setLeadCount(selectedLeads.length);
    renderLeadList();
    updateSummary();
}

function renderProgress(result) {
    const progress = document.getElementById("progress");
    progress.replaceChildren();
    progress.append(`Bulk Send Completed — Total: ${result.total}, Sent: ${result.successCount}, Failed: ${result.failedCount}`);
    (result.results || []).forEach(item => {
        const row = document.createElement("div");
        row.textContent = `${item.name} — ${item.status}`;
        progress.appendChild(row);
    });
}

document.getElementById("channel").addEventListener("change", () => {
    refreshTemplates()
        .then(() => { renderLeadList(); updateSummary(); })
        .catch(error => setStatus(error.message, "progress"));
});
document.getElementById("templateSelect").addEventListener("change", previewSelectedTemplate);
document.getElementById("sendBtn").addEventListener("click", () => sendBulkMessages().catch(error => setStatus(error.message, "progress")));
ZOHO.embeddedApp.init();
