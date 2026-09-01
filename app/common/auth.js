async function getOrganizationId() {
    const response = await ZOHO.CRM.CONFIG.getOrgInfo();
    const organization = Array.isArray(response?.org) ? response.org[0] : response?.org;
    const organizationId = organization?.id || organization?.org_id || organization?.organization_id;

    if (!organizationId) {
        throw new Error("Unable to determine the Zoho organization ID.");
    }

    return String(organizationId);
}

function isAuthkeyMissingError(error) {
    const message = `${error?.code || ""} ${error?.message || ""}`;
    return /authkey not found|credentials have not been configured|not configured/i.test(message);
}

async function openAuthkeySettings() {
    try {
        // WebTab1 is the Zoho CRM API name visible in the CRM URL:
        // /crm/tab/WebTab1
        await ZOHO.CRM.UI.WebTab.open({
            Entity: "WebTab1"
        });
    } catch (error) {
        console.error("Unable to open Authkey Settings Web Tab:", error);
        alert("Unable to open Authkey Settings. Please open the 'authkey setting' tab from the Zoho CRM navigation.");
    }
}

function showAuthkeyRequiredMessage() {
    if (document.getElementById("authkeyRequiredScreen")) return;

    document.body.innerHTML = `
        <div id="authkeyRequiredScreen" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;font-family:Arial,sans-serif;background:#f6f8fb;">
            <div style="max-width:520px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;text-align:center;box-shadow:0 8px 24px rgba(15,23,42,.08);">
                <div style="font-size:40px;margin-bottom:12px;">🔐</div>
                <h2 style="margin:0 0 12px;color:#1f2937;">Authkey Required</h2>
                <p style="margin:0 0 24px;color:#4b5563;line-height:1.6;">To use this feature, please add and validate your Authkey in the Authkey Settings page first.</p>
                <button type="button" onclick="openAuthkeySettings()" style="display:inline-block;padding:11px 18px;background:#2563eb;color:#fff;border:0;border-radius:6px;font-weight:600;cursor:pointer;">Open Authkey Settings</button>
            </div>
        </div>
    `;
}

async function ensureAuthkeyConfigured() {
    const organizationId = await getOrganizationId();

    try {
        await requestJson(`/api/authkey/${encodeURIComponent(organizationId)}`);
        return true;
    } catch (error) {
        if (isAuthkeyMissingError(error)) {
            showAuthkeyRequiredMessage();
            return false;
        }

        throw error;
    }
}
