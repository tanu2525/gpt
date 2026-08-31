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

    try {
        const response = await axios({
            method,
            url: `${baseUrl}${url}`,
            params,
            data,
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                "Content-Type": "application/json"
            }
        });

        return response.data;
    } catch (error) {
        const zohoError =
            error.response?.data ||
            error.message;

        console.error(
            "Zoho CRM API Error:",
            JSON.stringify(zohoError, null, 2)
        );

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
