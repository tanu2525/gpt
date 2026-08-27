const axios = require("axios");

const Authkey = require("../models/Authkey");
const zohoOAuthService = require("./zohoOAuthService");
const { decrypt } = require("../utils/crypto");

const AUTHKEY_ADD_LIST_URL =
    process.env.AUTHKEY_ADD_LIST_DATA_URL ||
    "https://console.authkey.io/restapi/addlistdata.php";

const SUPPORTED_MODULES = new Set([
    "Leads",
    "Contacts",
    "Accounts"
]);

const MODULE_CONFIG = {
    Leads: {
        listNameEnv: "AUTHKEY_ZOHO_LEADS_LIST_NAME",
        defaultListName: "Zoho_Leads",
        mobileFields: ["Mobile", "Phone"],
        billingFields: [
            "Billing_City",
            "Billing_State",
            "Billing_Country",
            "Billing_Street",
            "City",
            "State",
            "Country"
        ]
    },
    Contacts: {
        listNameEnv: "AUTHKEY_ZOHO_CONTACTS_LIST_NAME",
        defaultListName: "Zoho_Contacts",
        mobileFields: ["Mobile", "Phone"],
        billingFields: [
            "Mailing_City",
            "Mailing_State",
            "Mailing_Country",
            "Mailing_Street",
            "City",
            "State",
            "Country"
        ]
    },
    Accounts: {
        listNameEnv: "AUTHKEY_ZOHO_ACCOUNTS_LIST_NAME",
        defaultListName: "Zoho_Accounts",
        mobileFields: ["Phone", "Mobile"],
        billingFields: [
            "Billing_City",
            "Billing_State",
            "Billing_Country",
            "Billing_Street"
        ]
    }
};

function assertSupportedModule(moduleName) {
    if (!SUPPORTED_MODULES.has(moduleName)) {
        throw Object.assign(
            new Error("Only Leads, Contacts and Accounts are supported."),
            { statusCode: 400 }
        );
    }
}

async function getAuthkey(organizationId) {
    const credentials = await Authkey.findOne({ organizationId });

    if (!credentials) {
        throw Object.assign(
            new Error("Authkey credentials have not been configured."),
            { statusCode: 404 }
        );
    }

    return decrypt(credentials);
}

function getFirstValue(record, fields) {
    for (const field of fields) {
        const value = record?.[field];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            return String(value).trim();
        }
    }
    return "";
}

function getListName(moduleName) {
    const config = MODULE_CONFIG[moduleName];
    return process.env[config.listNameEnv] || config.defaultListName;
}

function mapRecordToAuthkey(record, moduleName, authkey) {
    const config = MODULE_CONFIG[moduleName];

    return {
        authkey,
        list_name: getListName(moduleName),
        source: "Zoho",
        country_code: process.env.DEFAULT_COUNTRY_CODE || "91",
        mobile: getFirstValue(record, config.mobileFields),
        billing: getFirstValue(record, config.billingFields)
    };
}

async function fetchRecordsPage(accessToken, apiDomain, moduleName, params) {
    const baseUrl = String(apiDomain || "https://www.zohoapis.com")
        .replace(/\/crm\/v\d+$/i, "")
        .replace(/\/$/, "");

    const response = await axios.get(
        `${baseUrl}/crm/v8/${encodeURIComponent(moduleName)}`,
        {
            params,
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`
            },
            timeout: 30000
        }
    );

    return response.data;
}

async function fetchAllRecords(organizationId, moduleName) {
    const { accessToken, apiDomain } =
        await zohoOAuthService.getAccessToken(organizationId);

    const records = [];
    let page = 1;
    let pageToken = null;

    while (true) {
        const params = {
            per_page: 200,
            ...(pageToken
                ? { page: 10, page_token: pageToken }
                : { page })
        };

        const response = await fetchRecordsPage(
            accessToken,
            apiDomain,
            moduleName,
            params
        );

        if (Array.isArray(response.data)) {
            records.push(...response.data);
        }

        const info = response.info || {};

        if (info.next_page_token) {
            pageToken = info.next_page_token;
            continue;
        }

        if (!info.more_records) {
            break;
        }

        page += 1;

        // Zoho allows normal page pagination only through the first 2000 records.
        // Once page 10 has been consumed, the response must provide next_page_token.
        if (page > 10) {
            break;
        }
    }

    return records;
}

async function sendToAuthkey(payload) {
    const response = await axios.post(
        AUTHKEY_ADD_LIST_URL,
        payload,
        {
            headers: {
                "Content-Type": "application/json"
            },
            timeout: 15000,
            validateStatus: () => true
        }
    );

    if (response.status < 200 || response.status >= 300) {
        const error = new Error(
            response.data?.message ||
            response.data?.error ||
            `Authkey returned HTTP ${response.status}.`
        );
        error.statusCode = response.status;
        error.providerResponse = response.data;
        throw error;
    }

    return response.data;
}

async function syncModule({ organizationId, module }) {
    assertSupportedModule(module);

    if (!organizationId) {
        throw Object.assign(
            new Error("Zoho organization ID is required."),
            { statusCode: 400 }
        );
    }

    const authkey = await getAuthkey(organizationId);
    const records = await fetchAllRecords(organizationId, module);

    const summary = {
        success: true,
        module,
        total: records.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        failures: []
    };

    // Authkey addlistdata.php accepts one mobile record per request, so one click
    // triggers the complete module sync while requests are sent in small batches.
    const concurrency = Number(process.env.AUTHKEY_BULK_CONCURRENCY || 5);

    for (let start = 0; start < records.length; start += concurrency) {
        const batch = records.slice(start, start + concurrency);

        const results = await Promise.all(
            batch.map(async record => {
                const payload = mapRecordToAuthkey(record, module, authkey);

                if (!payload.mobile) {
                    return {
                        type: "skipped",
                        recordId: record.id,
                        reason: "No Mobile or Phone value found."
                    };
                }

                try {
                    const providerResponse = await sendToAuthkey(payload);
                    return {
                        type: "sent",
                        recordId: record.id,
                        response: providerResponse
                    };
                } catch (error) {
                    return {
                        type: "failed",
                        recordId: record.id,
                        error: error.message,
                        providerResponse: error.providerResponse
                    };
                }
            })
        );

        for (const result of results) {
            if (result.type === "sent") {
                summary.sent += 1;
            } else if (result.type === "skipped") {
                summary.skipped += 1;
                summary.failures.push(result);
            } else {
                summary.failed += 1;
                summary.failures.push(result);
            }
        }
    }

    summary.success = summary.failed === 0;
    return summary;
}

module.exports = {
    syncModule,
    fetchAllRecords,
    mapRecordToAuthkey
};
