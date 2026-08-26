const axios = require("axios");

const ZOHO_CRM_BASE_URL =
    process.env.ZOHO_CRM_BASE_URL || "https://www.zohoapis.com/crm/v8";

async function zohoRequest({
    accessToken,
    method = "GET",
    url,
    params,
    data
}) {
    if (!accessToken) {
        throw new Error("Zoho OAuth access token is required");
    }

    const response = await axios({
        method,
        url: `${ZOHO_CRM_BASE_URL}${url}`,
        params,
        data,
        headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    return response.data;
}

async function getModules(accessToken) {
    return zohoRequest({
        accessToken,
        method: "GET",
        url: "/settings/modules"
    });
}

async function getWorkflowConfiguration(
    accessToken,
    moduleApiName
) {
    return zohoRequest({
        accessToken,
        method: "GET",
        url: "/workflow_configurations",
        params: {
            module: moduleApiName
        }
    });
}

module.exports = {
    getModules,
    getWorkflowConfiguration
};