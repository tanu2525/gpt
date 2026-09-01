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

function showAuthkeyRequiredMessage() {
    if (document.getElementById("authkeyRequiredScreen")) return;

    document.body.innerHTML = `
        <div id="authkeyRequiredScreen"
            style="
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:24px;
                box-sizing:border-box;
                font-family:Arial,sans-serif;
                background:#f6f8fb;
            "
        >
            <div
                style="
                    max-width:520px;
                    width:100%;
                    background:#fff;
                    border:1px solid #e2e8f0;
                    border-radius:12px;
                    padding:32px;
                    text-align:center;
                    box-shadow:0 8px 24px rgba(15,23,42,.08);
                "
            >
                <div style="font-size:40px;margin-bottom:12px;">
                    🔐
                </div>

                <h2 style="margin:0 0 12px;color:#1f2937;">
                    Authkey Required
                </h2>

                <p style="margin:0;color:#4b5563;line-height:1.7;">
                    An Authkey has not been configured for this Zoho CRM
                    organization.
                    <br><br>
                    Please open the <strong>Authkey Settings</strong> tab
                    from the Zoho CRM navigation and add a valid Authkey
                    before using this feature.
                </p>
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
