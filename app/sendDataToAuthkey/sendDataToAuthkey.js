let moduleFields = [];
let zohoConnection = null;
const SUPPORTED_MODULES = ["Leads", "Contacts", "Accounts"];

function getConnectionData(connection) {
    if (!connection || typeof connection !== "object") return {};
    return connection.connection || connection.data?.connection || connection.data || connection;
}

function isZohoConnected(connection) {
    if (!connection || typeof connection !== "object") return false;

    const candidates = [connection, getConnectionData(connection)];

    for (const value of candidates) {
        if (!value || typeof value !== "object") continue;

        if (value.connected === true || value.isConnected === true) return true;
        if (value.connected === "true" || value.isConnected === "true") return true;
        if (["connected", "active"].includes(String(value.status || "").toLowerCase())) return true;
        if (value.apiDomain || value.api_domain) return true;
    }

    return false;
}

function setStatus(elementId, message = "", type = "") {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `status ${type}`;
}

function showOnly(viewId) {
    ["historyView", "configView"].forEach(id => {
        document.getElementById(id).hidden = id !== viewId;
    });
}

function setZohoConnectionUi(connection) {
    const card = document.getElementById("zohoConnectionCard");
    const button = document.getElementById("connectZohoBtn");
    const details = document.getElementById("zohoConnectionStatus");
    const connected = isZohoConnected(connection);

    zohoConnection = connection;

    if (connected) {
        card.hidden = true;
        button.hidden = true;
        return;
    }

    card.hidden = false;
    button.hidden = false;
    button.textContent = "Connect Zoho CRM";
    details.textContent = "Connect this Zoho CRM organization before sending CRM records to Authkey.";
}

async function checkZohoConnection() {
    const organizationId = await getOrganizationId();
    const result = await requestJson(
        `/api/workflow/zoho/connection?organizationId=${encodeURIComponent(organizationId)}`
    );

    setZohoConnectionUi(result);
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
        document.getElementById("zohoConnectionStatus").textContent =
            "Complete Zoho authorization in the opened window, then return here and reload the page.";
    } catch (error) {
        document.getElementById("zohoConnectionStatus").textContent = error.message;
    }
}

async function requireZohoConnection() {
    const connection = await checkZohoConnection();

    if (!isZohoConnected(connection)) {
        throw new Error("Connect Zoho CRM before sending module data to Authkey.");
    }

    return connection;
}

function showHistory() {
    showOnly("historyView");
    loadHistory().catch(error => setStatus("historyStatus", error.message, "error"));
}

async function showConfiguration() {
    try {
        setStatus("historyStatus");
        await requireZohoConnection();
        showOnly("configView");
        setStatus("configStatus");
        await loadModuleFields();
    } catch (error) {
        showOnly("historyView");
        setStatus("historyStatus", error.message, "error");
    }
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
    return name;
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
    payloadLabel.textContent = "Authkey Payload Field";

    const payloadInput = document.createElement("input");
    payloadInput.className = "payload-path";
    payloadInput.placeholder = "Example: email, mobile or first_name";
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
    removeButton.setAttribute("aria-label", "Remove field mapping");
    removeButton.title = "Remove field mapping";
    removeButton.innerHTML = "&times;";

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
            return { zohoField, payloadPath, label: field?.field_label || zohoField };
        })
        .filter(mapping => mapping.zohoField && mapping.payloadPath);
}

async function sendData() {
    const button = document.getElementById("sendBtn");
    const module = document.getElementById("moduleSelect").value;
    const listName = document.getElementById("listNameInput").value.trim();
    const mappings = getMappings();

    if (!listName) throw new Error("Enter the Authkey contact list name.");
    if (!mappings.length) throw new Error("Add at least one complete field mapping.");

    button.disabled = true;
    button.textContent = "Sending...";
    setStatus("configStatus", "Fetching CRM records. Each record will be sent individually to the selected Authkey contact list.");

    try {
        await requireZohoConnection();
        const organizationId = await getOrganizationId();
        const result = await requestJson("/api/zoho/authkey/sync-module", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId, module, listName, mappings })
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
        createCell(row, item.listName || "-");
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
        body.appendChild(row);
    });
}

async function initialize() {
    const connectionCard = document.getElementById("zohoConnectionCard");
    connectionCard.hidden = true;

    try {
        if (!(await ensureAuthkeyConfigured())) return;

        const [connection] = await Promise.all([
            checkZohoConnection(),
            loadHistory()
        ]);

        setZohoConnectionUi(connection);
    } catch (error) {
        connectionCard.hidden = true;
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
document.getElementById("connectZohoBtn").addEventListener("click", connectZoho);

ZOHO.embeddedApp.on("PageLoad", initialize);
ZOHO.embeddedApp.init();
