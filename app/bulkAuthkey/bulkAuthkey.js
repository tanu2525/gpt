let moduleName = null;

const SUPPORTED_MODULES = new Set([
    "Leads",
    "Contacts",
    "Accounts"
]);

const DEFAULT_MAPPINGS = [
    { zohoField: "Mobile", payloadPath: "mobile", label: "Mobile" },
    { zohoField: "Phone", payloadPath: "phone", label: "Phone" },
    { zohoField: "Email", payloadPath: "email", label: "Email" },
    { zohoField: "First_Name", payloadPath: "first_name", label: "First Name" },
    { zohoField: "Last_Name", payloadPath: "last_name", label: "Last Name" }
];

function setStatus(message, isError = false) {
    const status = document.getElementById("status");
    status.textContent = message;
    status.style.color = isError ? "#b00020" : "#222";
}

function normalizeModule(value) {
    const module = String(value || "").trim();
    if (module === "Lead") return "Leads";
    if (module === "Contact") return "Contacts";
    if (module === "Account") return "Accounts";
    return module;
}

async function initialize(data = {}) {
    try {
        if (!(await ensureAuthkeyConfigured())) return;

        moduleName = normalizeModule(
            data.Entity ||
            data.Module ||
            data.entity ||
            data.module
        );

        document.getElementById("moduleName").textContent = moduleName || "Unknown";

        if (!SUPPORTED_MODULES.has(moduleName)) {
            setStatus("This button is supported only in Leads, Contacts and Accounts.", true);
            return;
        }

        document.getElementById("syncBtn").disabled = false;
        setStatus(`Ready to send all ${moduleName} records to Authkey.`);
    } catch (error) {
        console.error(error);
        setStatus(error.message || "Unable to verify Authkey configuration.", true);
    }
}

async function syncModule() {
    if (!SUPPORTED_MODULES.has(moduleName)) {
        throw new Error("Unsupported Zoho module.");
    }

    const button = document.getElementById("syncBtn");
    button.disabled = true;
    button.textContent = "Sending...";
    setStatus(`Fetching and sending all ${moduleName} records...`);

    try {
        const organizationId = await getOrganizationId();
        const result = await requestJson("/api/zoho/authkey/sync-module", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                organizationId,
                module: moduleName,
                mappings: DEFAULT_MAPPINGS
            })
        });

        document.getElementById("summary").hidden = false;
        document.getElementById("total").textContent = result.total ?? 0;
        document.getElementById("sent").textContent = result.sent ?? 0;
        document.getElementById("skipped").textContent = result.skipped ?? 0;
        document.getElementById("failed").textContent = result.failed ?? 0;

        if (result.failed > 0 || result.skipped > 0) {
            setStatus(
                `Completed with exceptions. Sent: ${result.sent}, skipped: ${result.skipped}, failed: ${result.failed}.`,
                result.failed > 0
            );
        } else {
            setStatus(`Successfully sent all ${result.sent} ${moduleName} records to Authkey.`);
        }
    } catch (error) {
        console.error(error);
        setStatus(error.message || "Bulk sync failed.", true);
    } finally {
        button.disabled = false;
        button.textContent = "Send Data to Authkey";
    }
}

document.getElementById("syncBtn").addEventListener("click", () => syncModule());
ZOHO.embeddedApp.on("PageLoad", initialize);
ZOHO.embeddedApp.init();
