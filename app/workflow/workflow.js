let moduleFields = [];
let zohoConnection = null;
let currentWorkflowId = null;
let pendingEditWorkflow = null;
const lookupFieldCache = new Map();

function isZohoConnected(connection) {
    return connection?.connected === true ||
        (connection?.success === true && Boolean(connection?.apiDomain));
}

function setStatus(message) {
    document.getElementById("status").textContent = message || "";
}

function setConnectionUi(connection) {
    const card = document.getElementById("zohoConnectionCard");
    const button = document.getElementById("connectZohoBtn");
    const details = document.getElementById("zohoConnectionStatus");

    if (!card || !button || !details) return;

    const connected = isZohoConnected(connection);
    card.hidden = connected;

    if (connected) {
        button.hidden = true;
        details.textContent = "";
    } else {
        button.hidden = false;
        button.textContent = "Connect Zoho CRM";
        details.textContent = "Connect this Zoho CRM organization before creating or editing a workflow.";
    }
}

async function checkZohoConnection() {
    const organizationId = await getOrganizationId();
    const result = await requestJson(
        `/api/workflow/zoho/connection?organizationId=${encodeURIComponent(organizationId)}`
    );

    zohoConnection = result;
    setConnectionUi(result);
    return result;
}

async function connectZoho() {
    try {
        const context = await getOrganizationContext();
        const params = new URLSearchParams({ organizationId: context.organizationId });

        if (context.apiDomain) params.set("apiDomain", context.apiDomain);
        if (context.countryCode) params.set("countryCode", context.countryCode);

        const result = await requestJson(`/api/workflow/zoho/oauth?${params.toString()}`);

        if (!result.authorizationUrl) {
            throw new Error("Zoho authorization URL was not generated.");
        }

        window.open(result.authorizationUrl, "_blank");
        setStatus("Complete Zoho authorization in the opened window. Return here and reopen this workflow page after authorization.");
    } catch (error) {
        setStatus(error.message);
    }
}

function showHistoryView() {
    document.getElementById("historyView").hidden = false;
    document.getElementById("editorView").hidden = true;
    setStatus("");
    loadWorkflowHistory().catch(error => setStatus(error.message));
}

function showEditorView() {
    document.getElementById("historyView").hidden = true;
    document.getElementById("editorView").hidden = false;
}

function getWorkflowAction() {
    return document.getElementById("workflowAction").value;
}

function updateActionUi() {
    const isContactList = getWorkflowAction() === "contact_list";
    document.getElementById("messageConfiguration").hidden = isContactList;
    document.getElementById("contactListConfiguration").hidden = !isContactList;
}

function resetEditor() {
    currentWorkflowId = null;
    pendingEditWorkflow = null;
    moduleFields = [];
    lookupFieldCache.clear();
    document.getElementById("editorTitle").textContent = "Create Workflow";
    document.getElementById("editorDescription").textContent = "Configure an Authkey workflow. Zoho automation will be created automatically when you save.";
    document.getElementById("workflowName").value = "";
    document.getElementById("trigger").value = "create";
    document.getElementById("workflowAction").value = "message";
    document.getElementById("channel").value = "whatsapp";
    document.getElementById("contactListName").value = "";
    document.getElementById("variablesContainer").innerHTML = "";
    document.getElementById("contactMappingsContainer").innerHTML = "";
    document.getElementById("workflowForm").hidden = true;
    setStatus("");
    updateActionUi();
}

async function loadWorkflowHistory() {
    const organizationId = await getOrganizationId();
    const result = await requestJson(
        `/api/workflow/history?organizationId=${encodeURIComponent(organizationId)}`
    );

    renderWorkflowHistory(result.workflows || []);
}

function formatWorkflowDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function renderWorkflowHistory(workflows) {
    const tbody = document.getElementById("workflowHistoryBody");
    tbody.innerHTML = "";

    if (!workflows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No workflow rules have been created yet. Click "Create New Workflow" to create your first workflow.</td></tr>';
        return;
    }

    workflows.forEach(workflow => {
        const row = document.createElement("tr");
        const isContactList = workflow.actionType === "contact_list";
        const statusClass = workflow.enabled ? "status-active" : "status-inactive";
        const statusText = workflow.enabled ? "Active" : "Inactive";
        const actionLabel = isContactList ? "Send to Contact List" : "Send Message";
        const configuration = isContactList
            ? (workflow.contactListName || "-")
            : (workflow.templateName || workflow.templateId || "-");

        row.innerHTML = `
            <td>${escapeHtml(workflow.workflowName || "-")}</td>
            <td>${escapeHtml(workflow.module || "-")}</td>
            <td>${escapeHtml(workflow.trigger === "edit" ? "Update" : "Create")}</td>
            <td>${escapeHtml(actionLabel)}</td>
            <td>${escapeHtml(configuration)}</td>
            <td>${escapeHtml(formatWorkflowDate(workflow.updatedAt))}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td><button type="button" class="edit-workflow-btn">Edit</button></td>
        `;

        row.querySelector(".edit-workflow-btn").addEventListener("click", () => {
            openEditorForEdit(workflow).catch(error => setStatus(error.message));
        });

        tbody.appendChild(row);
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function prepareEditor() {
    if (!(await ensureAuthkeyConfigured())) return false;

    const connection = await checkZohoConnection();
    if (!isZohoConnected(connection)) {
        document.getElementById("workflowForm").hidden = true;
        setStatus("Connect this Zoho organization once before creating or editing a workflow.");
        return false;
    }

    document.getElementById("workflowForm").hidden = false;
    return true;
}

async function openEditorForCreate() {
    resetEditor();
    showEditorView();

    if (!(await prepareEditor())) return;

    await loadModules();
    await loadModuleFields();
    await loadTemplates();
    await renderMappings(document.getElementById("templateSelect").selectedOptions[0]?.dataset.body || "");
    addContactMapping();
    await previewWorkflow();
}

async function openEditorForEdit(workflow) {
    resetEditor();
    currentWorkflowId = workflow._id;
    pendingEditWorkflow = workflow;
    document.getElementById("editorTitle").textContent = "Edit Workflow";
    document.getElementById("editorDescription").textContent = "Update the workflow configuration. Saving will update the Authkey workflow and recreate the linked Zoho automation.";
    document.getElementById("workflowName").value = workflow.workflowName || "";
    document.getElementById("trigger").value = workflow.trigger || "create";
    document.getElementById("workflowAction").value = workflow.actionType || "message";
    document.getElementById("channel").value = workflow.channel && workflow.channel !== "contact_list" ? workflow.channel : "whatsapp";
    document.getElementById("contactListName").value = workflow.contactListName || "";
    updateActionUi();
    showEditorView();

    if (!(await prepareEditor())) return;

    await loadModules();
    document.getElementById("module").value = workflow.module || document.getElementById("module").value;
    await loadModuleFields();

    if (workflow.actionType === "contact_list") {
        const mappings = Array.isArray(workflow.contactMappings) ? workflow.contactMappings : [];
        if (mappings.length) {
            mappings.forEach(mapping => addContactMapping(mapping));
        } else {
            addContactMapping();
        }
        return;
    }

    await loadTemplates({ channel: workflow.channel || "whatsapp" });

    const templateSelect = document.getElementById("templateSelect");
    if (workflow.templateId && [...templateSelect.options].some(option => option.value === String(workflow.templateId))) {
        templateSelect.value = String(workflow.templateId);
    }

    populateRecipientFields();
    if (workflow.recipientField && [...document.getElementById("recipientField").options].some(option => option.value === workflow.recipientField)) {
        document.getElementById("recipientField").value = workflow.recipientField;
    }

    await renderMappings(templateSelect.selectedOptions[0]?.dataset.body || "");

    Object.entries(workflow.variables || {}).forEach(([name, value]) => {
        const mapping = document.getElementById(`map_${name}`);
        if (mapping && [...mapping.options].some(option => option.value === value)) {
            mapping.value = value;
        }
    });

    await previewWorkflow();
}

async function loadModules() {
    const organizationId = await getOrganizationId();
    const result = await requestJson(`/api/workflow/zoho/modules?organizationId=${encodeURIComponent(organizationId)}`);
    const select = document.getElementById("module");
    select.innerHTML = "";

    const modules = (result.modules || [])
        .filter(module => module.api_name)
        .filter(module => module.status === "visible" || !module.status)
        .sort((a, b) => String(a.module_name || a.plural_label || a.api_name)
            .localeCompare(String(b.module_name || b.plural_label || b.api_name)));

    modules.forEach(module => {
        const option = document.createElement("option");
        option.value = module.api_name;
        option.textContent = module.module_name || module.plural_label || module.api_name;
        select.appendChild(option);
    });

    if (!modules.length) {
        throw new Error("No supported Zoho CRM modules are available for this organization.");
    }
}

async function loadModuleFields() {
    const organizationId = await getOrganizationId();
    const module = document.getElementById("module").value;
    const result = await requestJson(`/api/workflow/zoho/fields?organizationId=${encodeURIComponent(organizationId)}&module=${encodeURIComponent(module)}`);
    moduleFields = result.fields || [];
    lookupFieldCache.clear();
    populateRecipientFields();
    refreshContactMappingFields();
    await renderMappings(document.getElementById("templateSelect").selectedOptions[0]?.dataset.body || "");
}

function populateRecipientFields() {
    const select = document.getElementById("recipientField");
    const channel = document.getElementById("channel").value.toLowerCase();
    select.innerHTML = "";

    const preferred = channel === "email"
        ? moduleFields.filter(field => field.data_type === "email" || field.api_name === "Email")
        : moduleFields.filter(field => ["phone", "mobile", "lookup"].includes(String(field.data_type || "").toLowerCase()));

    const fields = preferred.length ? preferred : moduleFields;

    fields.forEach(field => {
        const option = document.createElement("option");
        option.value = field.api_name;
        option.textContent = `${field.field_label || field.field_name || field.api_name} (${field.api_name})`;
        select.appendChild(option);
    });

    if (!select.options.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No compatible recipient field found";
        select.appendChild(option);
    }
}

function createContactFieldOptions(select, selectedValue = "") {
    select.innerHTML = '<option value="">Select Zoho field</option>';
    moduleFields.forEach(field => {
        const option = document.createElement("option");
        option.value = field.api_name;
        option.textContent = `${field.field_label || field.field_name || field.api_name} (${field.api_name})`;
        select.appendChild(option);
    });
    if (selectedValue) select.value = selectedValue;
}

function addContactMapping(mapping = {}) {
    const container = document.getElementById("contactMappingsContainer");
    const row = document.createElement("div");
    row.className = "contact-mapping-row";

    const zohoSelect = document.createElement("select");
    zohoSelect.className = "contact-zoho-field";
    createContactFieldOptions(zohoSelect, mapping.zohoField || "");

    const payloadInput = document.createElement("input");
    payloadInput.type = "text";
    payloadInput.className = "contact-payload-path";
    payloadInput.placeholder = "Authkey payload field, e.g. mobile";
    payloadInput.value = mapping.payloadPath || "";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "contact-mapping-remove";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", "Remove field mapping");
    removeButton.addEventListener("click", () => row.remove());

    row.append(zohoSelect, payloadInput, removeButton);
    container.appendChild(row);
}

function refreshContactMappingFields() {
    document.querySelectorAll(".contact-zoho-field").forEach(select => {
        const currentValue = select.value;
        createContactFieldOptions(select, currentValue);
    });
}

function getContactMappings() {
    return [...document.querySelectorAll("#contactMappingsContainer .contact-mapping-row")]
        .map(row => ({
            zohoField: row.querySelector(".contact-zoho-field")?.value || "",
            payloadPath: row.querySelector(".contact-payload-path")?.value.trim() || ""
        }))
        .filter(mapping => mapping.zohoField && mapping.payloadPath);
}

function getLookupModule(field) {
    return field?.lookup?.module?.api_name ||
        field?.lookup?.module?.apiName ||
        field?.lookup?.module ||
        field?.associated_module?.module?.api_name ||
        field?.associated_module?.module ||
        field?.connected_details?.module?.api_name ||
        field?.connected_details?.module ||
        "";
}

async function getLookupFields(field) {
    const relatedModule = getLookupModule(field);
    if (!relatedModule) return [];

    if (lookupFieldCache.has(relatedModule)) {
        return lookupFieldCache.get(relatedModule);
    }

    const organizationId = await getOrganizationId();
    const result = await requestJson(
        `/api/workflow/zoho/fields?organizationId=${encodeURIComponent(organizationId)}&module=${encodeURIComponent(relatedModule)}`
    );

    const fields = result.fields || [];
    lookupFieldCache.set(relatedModule, fields);
    return fields;
}

async function renderMappings(body = "") {
    const container = document.getElementById("variablesContainer");
    container.innerHTML = "";
    const variables = getTemplateVariables(body);

    const lookupMappings = [];
    for (const field of moduleFields) {
        if (String(field.data_type || "").toLowerCase() !== "lookup") continue;
        lookupMappings.push({ field, fields: await getLookupFields(field) });
    }

    variables.forEach(variable => {
        const div = document.createElement("div");
        div.className = "mapping";
        const label = document.createElement("label");
        label.textContent = variable;
        const select = document.createElement("select");
        select.id = `map_${variable}`;

        moduleFields.forEach(field => {
            const option = document.createElement("option");
            option.value = field.api_name;
            option.textContent = `${field.field_label || field.api_name} (${field.api_name})`;
            select.appendChild(option);
        });

        lookupMappings.forEach(({ field: lookupField, fields }) => {
            fields.forEach(relatedField => {
                const option = document.createElement("option");
                option.value = `${lookupField.api_name}.${relatedField.api_name}`;
                option.textContent = `${lookupField.field_label || lookupField.api_name} → ${relatedField.field_label || relatedField.api_name}`;
                select.appendChild(option);
            });
        });

        div.appendChild(label);
        div.appendChild(select);
        container.appendChild(div);
    });
}

async function saveWorkflow() {
    const actionType = getWorkflowAction();
    const variables = {};
    document.querySelectorAll("#variablesContainer select").forEach(select => {
        if (select.value) {
            variables[select.id.replace("map_", "")] = select.value;
        }
    });

    const body = {
        organizationId: await getOrganizationId(),
        workflowId: currentWorkflowId || undefined,
        workflowName: document.getElementById("workflowName").value.trim(),
        module: document.getElementById("module").value,
        trigger: document.getElementById("trigger").value,
        actionType,
        autoConfigureZoho: true
    };

    if (actionType === "contact_list") {
        body.contactListName = document.getElementById("contactListName").value.trim();
        body.contactMappings = getContactMappings();

        if (!body.contactListName) {
            setStatus("Enter the Authkey contact list name.");
            return;
        }

        if (!body.contactMappings.length) {
            setStatus("Add at least one Zoho field mapping for the Authkey contact list.");
            return;
        }
    } else {
        const template = document.getElementById("templateSelect").selectedOptions[0];
        body.channel = document.getElementById("channel").value;
        body.templateId = document.getElementById("templateSelect").value;
        body.templateName = template ? template.textContent : "";
        body.recipientField = document.getElementById("recipientField").value;
        body.variables = variables;
    }

    try {
        setStatus(currentWorkflowId ? "Updating workflow and configuring Zoho automation..." : "Saving workflow and configuring Zoho automation...");
        const result = await requestJson("/api/workflow/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        setStatus(result.zoho?.webhookUrl
            ? (currentWorkflowId
                ? "Workflow updated and Zoho automation recreated successfully."
                : "Workflow saved and Zoho webhook + workflow rule configured successfully.")
            : "Workflow saved successfully.");

        setTimeout(() => showHistoryView(), 800);
    } catch (error) {
        setStatus(error.message);
    }
}

async function initializeWorkflowPage() {
    try {
        if (!(await ensureAuthkeyConfigured())) return;
        await loadWorkflowHistory();
    } catch (error) {
        setStatus(error.message);
    }
}

ZOHO.embeddedApp.on("PageLoad", initializeWorkflowPage);

document.getElementById("createWorkflowBtn").addEventListener("click", () => {
    openEditorForCreate().catch(error => setStatus(error.message));
});

document.getElementById("backToHistoryBtn").addEventListener("click", showHistoryView);
document.getElementById("workflowAction").addEventListener("change", updateActionUi);
document.getElementById("addContactMappingBtn").addEventListener("click", () => addContactMapping());
document.getElementById("module").addEventListener("change", () => {
    loadModuleFields().then(() => {
        if (getWorkflowAction() === "message") return previewWorkflow();
    }).catch(error => setStatus(error.message));
});

document.getElementById("channel").addEventListener("change", () => {
    populateRecipientFields();
    loadTemplates().then(async () => {
        await renderMappings(document.getElementById("templateSelect").selectedOptions[0]?.dataset.body || "");
        await previewWorkflow();
    }).catch(error => setStatus(error.message));
});

document.getElementById("templateSelect").addEventListener("change", () => {
    renderMappings(document.getElementById("templateSelect").selectedOptions[0]?.dataset.body || "")
        .then(previewWorkflow)
        .catch(error => setStatus(error.message));
});

document.getElementById("connectZohoBtn").addEventListener("click", connectZoho);
document.getElementById("saveBtn").addEventListener("click", saveWorkflow);
ZOHO.embeddedApp.init();
