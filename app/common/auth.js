function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/$/, "");
}

function getZohoApiDomainFromCountry(countryCode, country) {
    const code = String(countryCode || "").trim().toUpperCase();
    const name = String(country || "").trim().toLowerCase();

    if (code === "IN" || name === "india") return "https://www.zohoapis.in";
    if (code === "AU" || name === "australia") return "https://www.zohoapis.com.au";
    if (code === "JP" || name === "japan") return "https://www.zohoapis.jp";
    if (code === "SG" || name === "singapore") return "https://www.zohoapis.sg";

    const euCountries = new Set([
        "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
        "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
        "PL", "PT", "RO", "SK", "SI", "ES", "SE"
    ]);

    if (euCountries.has(code)) return "https://www.zohoapis.eu";

    return "";
}

function getZohoApiDomainFromUrl(value) {
    const text = normalizeUrl(value).toLowerCase();
    if (!text) return "";

    if (/zohoapis\.in|crm\.zoho\.in/.test(text)) return "https://www.zohoapis.in";
    if (/zohoapis\.eu|crm\.zoho\.eu/.test(text)) return "https://www.zohoapis.eu";
    if (/zohoapis\.com\.au|crm\.zoho\.com\.au/.test(text)) return "https://www.zohoapis.com.au";
    if (/zohoapis\.jp|crm\.zoho\.jp/.test(text)) return "https://www.zohoapis.jp";
    if (/zohoapis\.sg|crm\.zoho\.sg/.test(text)) return "https://www.zohoapis.sg";
    if (/zohoapis\.com|crm\.zoho\.com/.test(text)) return "https://www.zohoapis.com";

    return "";
}

function getZohoApiDomainFromPageContext() {
    const candidates = [
        window.location?.href,
        document.referrer
    ];

    try {
        const origins = window.location?.ancestorOrigins;
        if (origins) candidates.push(...Array.from(origins));
    } catch (_) {
        // ancestorOrigins is not available in every browser.
    }

    for (const candidate of candidates) {
        const apiDomain = getZohoApiDomainFromUrl(candidate);
        if (apiDomain) return apiDomain;
    }

    return "";
}

function resolveZohoApiDomain(organization) {
    const directCandidates = [
        organization?.api_domain,
        organization?.apiDomain,
        organization?.crm_api_domain,
        organization?.crmApiDomain,
        organization?.api_url,
        organization?.apiUrl,
        organization?.base_url,
        organization?.baseUrl,
        organization?.crm_url,
        organization?.crmUrl,
        organization?.url
    ];

    for (const candidate of directCandidates) {
        const apiDomain = getZohoApiDomainFromUrl(candidate);
        if (apiDomain) return apiDomain;
    }

    const countryBasedDomain = getZohoApiDomainFromCountry(
        organization?.country_code || organization?.countryCode,
        organization?.country
    );

    if (countryBasedDomain) return countryBasedDomain;

    return getZohoApiDomainFromPageContext();
}

async function getOrganizationContext() {
    const response = await ZOHO.CRM.CONFIG.getOrgInfo();
    const organization = Array.isArray(response?.org) ? response.org[0] : response?.org;

    const organizationId =
        organization?.id ||
        organization?.org_id ||
        organization?.organization_id;

    if (!organizationId) {
        throw new Error("Unable to determine the Zoho organization ID.");
    }

    const apiDomain = resolveZohoApiDomain(organization);

    const environment =
        organization?.type ||
        organization?.environment ||
        "";

    return {
        organizationId: String(organizationId),
        apiDomain: String(apiDomain || ""),
        environment: String(environment || ""),
        countryCode: String(
            organization?.country_code || organization?.countryCode || ""
        )
    };
}

async function getOrganizationId() {
    const context = await getOrganizationContext();
    return context.organizationId;
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
                <div style="font-size:40px;margin-bottom:12px;">🔐</div>
                <h2 style="margin:0 0 12px;color:#1f2937;">Authkey Required</h2>
                <p style="margin:0;color:#4b5563;line-height:1.7;">
                    An Authkey has not been configured for this Zoho CRM organization.
                    <br><br>
                    Please open the <strong>Authkey Settings</strong> tab and add a valid Authkey before using this feature.
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
