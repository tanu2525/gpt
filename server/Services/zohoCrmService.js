const axios = require("axios");

const DEFAULT_CRM_BASE_URL =
    process.env.ZOHO_CRM_BASE_URL ||
    "https://www.zohoapis.com/crm/v8";

function normalizeApiDomain(apiDomain) {
    return String(apiDomain || "").replace(/\/$/, "");
}
async function zohoRequest({
    accessToken,
    method = "GET",
    url,
    params,
    data,
    apiDomain
}) {
    if (!accessToken) {
        throw new Error("Zoho OAuth access token is required");
    }

    const baseUrl =
        `${normalizeApiDomain(apiDomain) || DEFAULT_CRM_BASE_URL}`
            .replace(/\/crm\/v\d+$/i, "")
            .replace(/\/$/, "") + "/crm/v8";

    const requestUrl = `${baseUrl}${url}`;

    console.log("\n========== ZOHO CRM REQUEST ==========");
    console.log("URL:", requestUrl);
    console.log("Method:", method);
    console.log("API Domain:", apiDomain);
    console.log(
        "Access Token:",
        accessToken
            ? `${accessToken.substring(0, 15)}...`
            : "MISSING"
    );
    console.log("=======================================\n");

    try {
        const response = await axios({
            method,
            url: requestUrl,
            params,
            data,
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                "Content-Type": "application/json"
            }
        });

        return response.data;

    } catch (error) {
        console.error("\n========== ZOHO CRM API ERROR ==========");
        console.error("Status:", error.response?.status);
        console.error("Request URL:", error.config?.url);
        console.error("Method:", error.config?.method);
        console.error("API Domain:", apiDomain);
        console.error(
            "Authorization present:",
            Boolean(error.config?.headers?.Authorization)
        );
        console.error(
            "Zoho Response:",
            JSON.stringify(error.response?.data, null, 2)
        );
        console.error("Error Message:", error.message);
        console.error("========================================\n");

        throw error;
    }
}

async function getModules(accessToken, apiDomain) {
    const response = await zohoRequest({
        accessToken,
        method: "GET",
        url: "/settings/modules",
        apiDomain
    });

    return response.modules || [];
}

async function getModule(
    accessToken,
    moduleApiName,
    apiDomain
) {
    const response = await zohoRequest({
        accessToken,
        method: "GET",
        url: `/settings/modules/${encodeURIComponent(moduleApiName)}`,
        apiDomain
    });

    return response.modules?.[0] || null;
}

async function getFields(
    accessToken,
    moduleApiName,
    apiDomain
) {
    const response = await zohoRequest({
        accessToken,
        method: "GET",
        url: "/settings/fields",
        params: {
            module: moduleApiName
        },
        apiDomain
    });

    return response.fields || [];
}

async function getWorkflowConfiguration(
    accessToken,
    moduleApiName,
    apiDomain
) {
    return zohoRequest({
        accessToken,
        method: "GET",
        url: "/workflow_configurations",
        params: {
            module: moduleApiName
        },
        apiDomain
    });
}

async function getRecord(
    accessToken,
    moduleApiName,
    recordId,
    apiDomain
) {
    if (!recordId) {
        throw new Error("Zoho record ID is required");
    }

    const response = await zohoRequest({
        accessToken,
        method: "GET",
        url:
            `/${encodeURIComponent(moduleApiName)}/${encodeURIComponent(recordId)}`,
        apiDomain
    });

    return response.data?.[0] || null;
}

module.exports = {
    zohoRequest,
    getModules,
    getModule,
    getFields,
    getWorkflowConfiguration,
    getRecord
};
