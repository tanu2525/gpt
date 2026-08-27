const axios = require("axios");

const ZOHO_CRM_BASE_URL =
    process.env.ZOHO_CRM_BASE_URL ||
    "https://www.zohoapis.com/crm/v8";

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

    try {
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


/*
 * Get all CRM modules
 */
async function getModules(accessToken) {
    const response = await zohoRequest({
        accessToken,
        method: "GET",
        url: "/settings/modules"
    });

    return response.modules || [];
}


/*
 * Get a single module
 */
async function getModule(
    accessToken,
    moduleApiName
) {
    const response = await zohoRequest({
        accessToken,
        method: "GET",
        url: `/settings/modules/${encodeURIComponent(moduleApiName)}`
    });

    return response.modules?.[0] || null;
}


/*
 * Get fields of a module.
 *
 * This is important for our workflow system because
 * every Zoho module can have different recipient fields.
 *
 * Example:
 * Leads      -> Mobile / Phone / Email
 * Contacts   -> Mobile / Phone / Email
 * Deals      -> Contact_Name
 * Accounts   -> Phone / Email
 */
async function getFields(
    accessToken,
    moduleApiName
) {
    const response = await zohoRequest({
        accessToken,
        method: "GET",
        url: "/settings/fields",
        params: {
            module: moduleApiName
        }
    });

    return response.fields || [];
}


/*
 * Get workflow configuration metadata.
 */
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


/*
 * Get a Zoho CRM record.
 *
 * Used by workflow execution when Zoho webhook
 * provides only the record ID.
 */
async function getRecord(
    accessToken,
    moduleApiName,
    recordId
) {
    if (!recordId) {
        throw new Error(
            "Zoho record ID is required"
        );
    }

    const response = await zohoRequest({
        accessToken,
        method: "GET",
        url:
            `/${encodeURIComponent(moduleApiName)}/${encodeURIComponent(recordId)}`
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