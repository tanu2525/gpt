let moduleFields = [];

const SUPPORTED_MODULES = ["Leads", "Contacts", "Accounts"];

function setStatus(elementId, message = "", type = "") {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `status ${type}`;
}

function showHistory() {
    document.getElementById("historyView").hidden = false;
    document.getElementById("configView").hidden = true;
    loadHistory().catch(error => {
        setStatus("historyStatus", error.message, "error");
    });
}

function showConfiguration() {
    document.getElementById("historyView").hidden = true;
    document.getElementById("configView").hidden = false;
    setStatus("configStatus");
}

function createOption(value, label, selectedValue = "") {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selectedValue;
    return option;
}

function getSuggestedPayloadPath(field) {
    const name = String(field.api_name || "").toLowerCase();

    if (["mobile", "phone"].includes(name)) return "mobile";
    if (name === "email") return "email";
    if (name === "first_name") return "first_name";
    if (name === "last_name") return "last_name";

    return String(field.api_name || "").toLowerCase();
}

function addMappingRow(mapping = {}) {
    const container = document.getElementById("mappingRows");
    const row = document.createElement("div");
    row.className = "mapping-row";

    const zohoGroup = document.createElement("div");
    zohoGroup.className = "field-group";
    const zohoLabel = document.createElement("label");
    zohoLabel.textContent = "Zoho CRM Field";
    const zohoSelect = document.createElement("select");
    zohoSelect.className = "zoho-field";
    zohoSelect.appendChild(createOption("", "Select Zoho field"));

    moduleFields.forEach(field => {
        const label = `${field.field_label || field.api_name} (${field.api_name})`;
        zohoSelect.appendChild(
            createOption(field.api_name, label, mapping.zohoField || "")
        );
    });

    zohoGroup.append(zohoLabel, zohoSelect);

    const payloadGroup = document.createElement("div");
    payloadGroup.className = "field-group";
    const payloadLabel = document.createElement("label");
    payloadLabel.textContent = "Authkey Payload Path";
    const payloadInput = document.createElement("input");
    payloadInput.className = "payload-path";
    payloadInput.placeholder = "Example: email or billing.city";
    payloadInput.value = mapping.payloadPath || "";
    payloadGroup.append(payloadLabel, payloadInput);

    zohoSelect.addEventListener("change", () => {
        if (payloadInput.value) return;
        const field = moduleFields.find(item => item.api_name === zohoSelect.value);
        if (field) payloadInput.value = getSuggestedPayloadPath(field);
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-btn";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
        row.remove();
        if (!container.children.length) addMappingRow();
    });

    row.append(zohoGroup, payloadGroup, removeButton);
    container.appendChild(row);
}

async function loadModuleFields() {
    const organizationId = await getOrganizationId();
    const module = document.getElementById("moduleSelect").value;

    if (!SUPPORTED_MODULES.includes(module)) {
        throw new Error("Select Leads, Contacts or Accounts.");
    }

    const result = await requestJson(
        `/api/workflow/zoho/fields?organizationId=${encodeURIComponent(organizationId)}&module=${encodeURIComponent(module)}`
    );

    moduleFields = (result.fields || [])
        .filter(field => field.api_name)
        .filter(field => !field.private && !field.system_mandatory)
        .sort((a, b) => String(a.field_label || a.api_name)
            .localeCompare(String(b.field_label || b.api_name)));

    const container = document.getElementById("mappingRows");
    container.innerHTML = "";

    const defaults = moduleFields
        .filter(field => ["Mobile", "Phone", "Email", "First_Name", "Last_Name"].includes(field.api_name))
        .slice(0, 5);

    if (defaults.length) {
        defaults.forEach(field => addMappingRow({
            zohoField: field.api_name,
            payloadPath: getSuggestedPayloadPath(field)
        }));
    } else {
        addMappingRow();
    }
}

function getMappings() {
    return [...document.querySelectorAll(".mapping-row")]
        .map(row => {
            const zohoField = row.querySelector(".zoho-field")?.value?.trim();
            const payloadPath = row.querySelector(".payload-path")?.value?.trim();
            const field = moduleFields.find(item => item.api_name === zohoField);

            return {
                zohoField,
                payloadPath,
                label: field?.field_label || zohoField
            };
        })
        .filter(mapping => mapping.zohoField && mapping.payloadPath);
}

async function sendData() {
    const button = document.getElementById("sendBtn");
    const module = document.getElementById("moduleSelect").value;
    const mappings = getMappings();

    if (!mappings.length) {
        throw new Error("Add at least one complete field mapping.");
    }

    button.disabled = true;
    button.textContent = "Sending...";
    setStatus("configStatus", "Fetching Zoho records and sending selected fields to Authkey...");

    try {
        const organizationId = await getOrganizationId();
        const result = await requestJson("/api/zoho/authkey/sync-module", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId, module, mappings })
        });

        setStatus(
            "configStatus",
            `Completed. Total: ${result.total}, Sent: ${result.sent}, Skipped: ${result.skipped}, Failed: ${result.failed}.`,
            result.failed ? "error" : "success"
        );
    } finally {
        button.disabled = false;
        button.textContent = "Send Module Data";
    }
}

async function loadHistory() {
    const organizationId = await getOrganizationId();
    const result = await requestJson(
        `/api/zoho/authkey/history/${encodeURIComponent(organizationId)}`
    );

    const body = document.getElementById("historyBody");
    const items = result.data || [];
    body.innerHTML = "";

    if (!items.length) {
        body.innerHTML = '<tr><td colspan="7">No data transfer history yet.</td></tr>';
        return;
    }

    items.forEach(item => {
        const row = document.createElement("tr");
        const date = item.createdAt
            ? new Date(item.createdAt).toLocaleString()
            : "-";
        const status = item.status || "failed";

        row.innerHTML = `
            <td>${date}</td>
            <td>${item.module || "-"}</td>
            <td>${item.total ?? 0}</td>
            <td>${item.sent ?? 0}</td>
            <td>${item.skipped ?? 0}</td>
            <td>${item.failed ?? 0}</td>
            <td><span class="badge ${status}">${status}</span></td>
        `;
        body.appendChild(row);
    });
}

async function initialize() {
    try {
        if (!(await ensureAuthkeyConfigured())) return;
        await loadModuleFields();
        await loadHistory();
    } catch (error) {
        console.error("Send Data to Authkey initialization error:", error);
        setStatus("historyStatus", error.message, "error");
        setStatus("configStatus", error.message, "error");
    }
}

document.getElementById("openSyncBtn").addEventListener("click", showConfiguration);
document.getElementById("backBtn").addEventListener("click", showHistory);
document.getElementById("moduleSelect").addEventListener("change", () => {
    loadModuleFields().catch(error => setStatus("configStatus", error.message, "error"));
});
document.getElementById("addFieldBtn").addEventListener("click", () => addMappingRow());
document.getElementById("sendBtn").addEventListener("click", () => {
    sendData().catch(error => setStatus("configStatus", error.message, "error"));
});

ZOHO.embeddedApp.on("PageLoad", initialize);
ZOHO.embeddedApp.init();
