let moduleFields = [];
let zohoConnection = null;
const lookupFieldCache = new Map();

function isZohoConnected(connection) {
    return connection?.connected === true ||
        (connection?.success === true && Boolean(connection?.apiDomain));
}

function setStatus(message) {
    document.getElementById("status").textContent = message || "";
}

function setConnectionUi(connection) {
    const button = document.getElementById("connectZohoBtn");
    const details = document.getElementById("zohoConnectionStatus");

    if (!button || !details) return;

    const connected = isZohoConnected(connection);

    if (connected) {
        // The user is already connected, so there is no reason to show a
        // Connect/Reconnect button on the workflow page.
        button.hidden = true;
        details.textContent = `Connected to ${connection.environment || "Zoho"} environment${connection.apiDomain ? ` (${connection.apiDomain})` : ""}.`;
    } else {
        button.hidden = false;
        button.textContent = "Connect Zoho CRM";
        details.textContent = "Zoho CRM must be connected once before automatic workflow creation can use the Zoho API.";
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
        setStatus(
            "Complete Zoho authorization in the opened window. The connection is environment-specific, so your Sandbox and Production organizations are connected separately. Return here and reload this page."
        );
    } catch (error) {
        setStatus(error.message);
    }
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

async function initializeWorkflow() {
    try {
        if (!(await ensureAuthkeyConfigured())) return;

        const connection = await checkZohoConnection();
        if (!isZohoConnected(connection)) {
            setStatus("Connect this Zoho organization once to create workflows automatically.");
            return;
        }

        await loadModules();
        await loadModuleFields();
        await loadTemplates();
        await previewWorkflow();
    } catch (error) {
        setStatus(error.message);
    }
}

ZOHO.embeddedApp.on("PageLoad", initializeWorkflow);

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
        setStatus("Saving workflow and configuring Zoho automation...");
        const result = await requestJson("/api/workflow/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        setStatus(result.zoho?.webhookUrl
            ? (result.zoho.updated
                ? "Workflow updated and Zoho automation recreated successfully."
                : "Workflow saved and Zoho webhook + workflow rule configured successfully.")
            : "Workflow saved successfully.");
    } catch (error) {
        setStatus(error.message);
    }
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

document.getElementById("module").addEventListener("change", () => {
    loadModuleFields().then(previewWorkflow).catch(error => setStatus(error.message));
});

document.getElementById("channel").addEventListener("change", () => {
    populateRecipientFields();
    loadTemplates().then(previewWorkflow).catch(error => setStatus(error.message));
});

document.getElementById("templateSelect").addEventListener("change", () => {
    renderMappings(document.getElementById("templateSelect").selectedOptions[0]?.dataset.body || "")
        .then(previewWorkflow)
        .catch(error => setStatus(error.message));
});
document.getElementById("connectZohoBtn").addEventListener("click", connectZoho);
document.getElementById("saveBtn").addEventListener("click", saveWorkflow);
ZOHO.embeddedApp.init();
