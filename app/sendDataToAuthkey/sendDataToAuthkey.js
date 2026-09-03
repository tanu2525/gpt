let moduleFields = [];
const SUPPORTED_MODULES = ["Leads", "Contacts", "Accounts"];

function setStatus(elementId, message = "", type = "") {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `status ${type}`;
}

function showOnly(viewId) {
    ["historyView", "detailsView", "configView"].forEach(id => {
        document.getElementById(id).hidden = id !== viewId;
    });
}

function showHistory() {
    showOnly("historyView");
    loadHistory().catch(error => setStatus("historyStatus", error.message, "error"));
}

function showConfiguration() {
    showOnly("configView");
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
        zohoSelect.appendChild(createOption(field.api_name, label, mapping.zohoField || ""));
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
    if (!SUPPORTED_MODULES.includes(module)) throw new Error("Select Leads, Contacts or Accounts.");

    const result = await requestJson(
        `/api/workflow/zoho/fields?organizationId=${encodeURIComponent(organizationId)}&module=${encodeURIComponent(module)}`
    );

    moduleFields = (result.fields || [])
        .filter(field => field.api_name)
        .filter(field => !field.private && !field.system_mandatory)
        .sort((a, b) => String(a.field_label || a.api_name).localeCompare(String(b.field_label || b.api_name)));

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
    } else addMappingRow();
}

function getMappings() {
    return [...document.querySelectorAll(".mapping-row")]
        .map(row => {
            const zohoField = row.querySelector(".zoho-field")?.value?.trim();
            const payloadPath = row.querySelector(".payload-path")?.value?.trim();
            const field = moduleFields.find(item => item.api_name === zohoField);
            return { zohoField, payloadPath, label: field?.field_label || zohoField };
        })
        .filter(mapping => mapping.zohoField && mapping.payloadPath);
}

async function sendData() {
    const button = document.getElementById("sendBtn");
    const module = document.getElementById("moduleSelect").value;
    const mappings = getMappings();
    if (!mappings.length) throw new Error("Add at least one complete field mapping.");

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

function createCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
    return cell;
}

async function loadHistory() {
    const organizationId = await getOrganizationId();
    const result = await requestJson(`/api/zoho/authkey/history/${encodeURIComponent(organizationId)}`);
    const body = document.getElementById("historyBody");
    const items = result.data || [];
    body.innerHTML = "";

    if (!items.length) {
        body.innerHTML = '<tr><td colspan="8">No data transfer history yet.</td></tr>';
        return;
    }

    items.forEach(item => {
        const row = document.createElement("tr");
        createCell(row, item.createdAt ? new Date(item.createdAt).toLocaleString() : "-");
        createCell(row, item.module || "-");
        createCell(row, item.total ?? 0);
        createCell(row, item.sent ?? 0);
        createCell(row, item.skipped ?? 0);
        createCell(row, item.failed ?? 0);

        const statusCell = document.createElement("td");
        const status = item.status || "failed";
        const badge = document.createElement("span");
        badge.className = `badge ${status}`;
        badge.textContent = status;
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        const detailsCell = document.createElement("td");
        const detailsButton = document.createElement("button");
        detailsButton.type = "button";
        detailsButton.className = "secondary-btn details-btn";
        detailsButton.textContent = "View Details";
        detailsButton.addEventListener("click", () => loadHistoryDetails(item._id));
        detailsCell.appendChild(detailsButton);
        row.appendChild(detailsCell);
        body.appendChild(row);
    });
}

async function loadHistoryDetails(historyId) {
    try {
        const organizationId = await getOrganizationId();
        const result = await requestJson(
            `/api/zoho/authkey/history/${encodeURIComponent(organizationId)}/${encodeURIComponent(historyId)}`
        );

        document.getElementById("detailsSummary").textContent =
            `${result.history.module} • Total ${result.history.total} • Sent ${result.history.sent} • Failed ${result.history.failed}`;

        const body = document.getElementById("detailsBody");
        body.innerHTML = "";

        if (!result.records?.length) {
            body.innerHTML = '<tr><td colspan="4">No individual record details are available.</td></tr>';
        } else {
            result.records.forEach(record => {
                const row = document.createElement("tr");
                createCell(row, record.recordId || "-");
                createCell(row, record.status || "-");
                createCell(row, JSON.stringify(record.data || {}));
                createCell(row, record.reason || "-");
                body.appendChild(row);
            });
        }

        showOnly("detailsView");
    } catch (error) {
        setStatus("historyStatus", error.message, "error");
    }
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
document.getElementById("detailsBackBtn").addEventListener("click", showHistory);
document.getElementById("moduleSelect").addEventListener("change", () => {
    loadModuleFields().catch(error => setStatus("configStatus", error.message, "error"));
});
document.getElementById("addFieldBtn").addEventListener("click", () => addMappingRow());
document.getElementById("sendBtn").addEventListener("click", () => {
    sendData().catch(error => setStatus("configStatus", error.message, "error"));
});

ZOHO.embeddedApp.on("PageLoad", initialize);
ZOHO.embeddedApp.init();
