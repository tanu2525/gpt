let moduleFields = [];

async function loadModules() {
    const organizationId = await getOrganizationId();
    const result = await requestJson(
        `/api/workflow/zoho/modules?organizationId=${encodeURIComponent(organizationId)}`
    );

    const select = document.getElementById("module");
    select.innerHTML = "";

    const modules = (result.modules || [])
        .filter(module => module.api_name)
        .filter(module => module.status === "visible" || !module.status)
        .filter(module => !["Notes", "Calls"].includes(module.api_name))
        .sort((a, b) => String(a.module_name || a.plural_label || a.api_name)
            .localeCompare(String(b.module_name || b.plural_label || b.api_name)));

    modules.forEach(module => {
        const option = document.createElement("option");
        option.value = module.api_name;
        option.textContent = module.module_name || module.plural_label || module.api_name;
        select.appendChild(option);
    });

    if (!modules.length) {
        throw new Error("No Zoho CRM modules are available for this organization.");
    }
}

async function loadModuleFields() {
    const organizationId = await getOrganizationId();
    const module = document.getElementById("module").value;

    const result = await requestJson(
        `/api/workflow/zoho/fields?organizationId=${encodeURIComponent(organizationId)}&module=${encodeURIComponent(module)}`
    );

    moduleFields = result.fields || [];
    populateRecipientFields();
    await renderMappings(document.getElementById("templateSelect").selectedOptions[0]?.dataset.body || "");
}

function populateRecipientFields() {
    const select = document.getElementById("recipientField");
    const channel = document.getElementById("channel").value.toLowerCase();

    select.innerHTML = "";

    const preferred = channel === "email"
        ? moduleFields.filter(field => field.data_type === "email" || field.api_name === "Email")
        : moduleFields.filter(field =>
            ["phone", "mobile", "email", "lookup"].includes(String(field.data_type || "").toLowerCase())
        );

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

async function initializeWorkflow() {
    try {
        await loadModules();
        await loadModuleFields();
        await loadTemplates();
        await previewWorkflow();
    } catch (error) {
        document.getElementById("status").textContent = error.message;
    }
}

ZOHO.embeddedApp.on("PageLoad", initializeWorkflow);

async function saveWorkflow() {
    const variables = {};

    document
        .querySelectorAll("#variablesContainer select")
        .forEach(select => {
            variables[select.id.replace("map_", "")] = select.value;
        });

    const template = document.getElementById("templateSelect").selectedOptions[0];

    const body = {
        organizationId: await getOrganizationId(),
        workflowName: document.getElementById("workflowName").value.trim(),
        module: document.getElementById("module").value,
        trigger: document.getElementById("trigger").value,
        channel: document.getElementById("channel").value,
        fallbackChannel: document.getElementById("fallbackChannel").value,
        templateId: document.getElementById("templateSelect").value,
        templateName: template ? template.textContent : "",
        recipientField: document.getElementById("recipientField").value,
        variables,
        autoConfigureZoho: true
    };

    try {
        const result = await requestJson("/api/workflow/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        document.getElementById("status").textContent =
            result.zoho?.webhookUrl
                ? "Workflow saved and Zoho automation configured successfully."
                : "Workflow saved successfully.";
    } catch (error) {
        document.getElementById("status").textContent = error.message;
    }
}

async function renderMappings(body = "") {
    const container = document.getElementById("variablesContainer");
    container.innerHTML = "";

    const variables = getTemplateVariables(body);

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

        div.appendChild(label);
        div.appendChild(select);
        container.appendChild(div);
    });
}

document.getElementById("module").addEventListener("change", () => {
    loadModuleFields().then(previewWorkflow).catch(error => {
        document.getElementById("status").textContent = error.message;
    });
});

document.getElementById("channel").addEventListener("change", () => {
    populateRecipientFields();
    loadTemplates()
        .then(previewWorkflow)
        .catch(error => {
            document.getElementById("status").textContent = error.message;
        });
});

document.getElementById("templateSelect").addEventListener("change", previewWorkflow);
document.getElementById("saveBtn").addEventListener("click", saveWorkflow);

ZOHO.embeddedApp.init();
