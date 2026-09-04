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

function resetEditor() {
    currentWorkflowId = null;
    pendingEditWorkflow = null;
    moduleFields = [];
    lookupFieldCache.clear();
    document.getElementById("editorTitle").textContent = "Create Workflow";
    document.getElementById("editorDescription").textContent = "Configure an Authkey message workflow. Zoho automation will be created automatically when you save.";
    document.getElementById("workflowName").value = "";
    document.getElementById("trigger").value = "create";
    document.getElementById("channel").value = "whatsapp";
    document.getElementById("variablesContainer").innerHTML = "";
    document.getElementById("workflowForm").hidden = true;
    document.getElementById("zohoConnectionCard").hidden = false;
    setStatus("");
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

        const statusClass = workflow.enabled ? "status-active" : "status-inactive";
        const statusText = workflow.enabled ? "Active" : "Inactive";

        row.innerHTML = `
            <td>${escapeHtml(workflow.workflowName || "-")}</td>
            <td>${escapeHtml(workflow.module || "-")}</td>
            <td>${escapeHtml(workflow.trigger === "edit" ? "Update" : "Create")}</td>
            <td>${escapeHtml(String(workflow.channel || "-").toUpperCase())}</td>
            <td>${escapeHtml(workflow.templateName || workflow.templateId || "-")}</td>
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
    document.getElementById("channel").value = workflow.channel || "whatsapp";
    showEditorView();

    if (!(await prepareEditor())) return;

    await loadModules();
    document.getElementById("module").value = workflow.module || document.getElementById("module").value;
    await loadModuleFields();
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
    const variables = {};
    document.querySelectorAll("#variablesContainer select").forEach(select => {
        if (select.value) {
            variables[select.id.replace("map_", "")] = select.value;
        }
    });

    const template = document.getElementById("templateSelect").selectedOptions[0];
    const body = {
        organizationId: await getOrganizationId(),
        workflowId: currentWorkflowId || undefined,
        workflowName: document.getElementById("workflowName").value.trim(),
        module: document.getElementById("module").value,
        trigger: document.getElementById("trigger").value,
        channel: document.getElementById("channel").value,
        templateId: document.getElementById("templateSelect").value,
        templateName: template ? template.textContent : "",
        recipientField: document.getElementById("recipientField").value,
        variables,
        autoConfigureZoho: true
    };

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

document.getElementById("module").addEventListener("change", () => {
    loadModuleFields().then(previewWorkflow).catch(error => setStatus(error.message));
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
