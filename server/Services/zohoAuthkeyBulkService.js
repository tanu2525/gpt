const axios = require("axios");

const Authkey = require("../models/Authkey");
const zohoOAuthService = require("./zohoOAuthService");
const { decrypt } = require("../utils/crypto");
const { getBulkConcurrency } = require("../utils/requestValidation");

const AUTHKEY_ADD_LIST_URL =
    process.env.AUTHKEY_ADD_LIST_DATA_URL ||
    "https://console.authkey.io/restapi/addlistdata.php";

const SUPPORTED_MODULES = new Set(["Leads", "Contacts", "Accounts"]);

const MODULE_CONFIG = {
    Leads: { listNameEnv: "AUTHKEY_ZOHO_LEADS_LIST_NAME", defaultListName: "Zoho_Leads", mobileFields: ["Mobile", "Phone"] },
    Contacts: { listNameEnv: "AUTHKEY_ZOHO_CONTACTS_LIST_NAME", defaultListName: "Zoho_Contacts", mobileFields: ["Mobile", "Phone"] },
    Accounts: { listNameEnv: "AUTHKEY_ZOHO_ACCOUNTS_LIST_NAME", defaultListName: "Zoho_Accounts", mobileFields: ["Phone", "Mobile"] }
};

function assertSupportedModule(moduleName) {
    if (!SUPPORTED_MODULES.has(moduleName)) {
        throw Object.assign(new Error("Only Leads, Contacts and Accounts are supported."), { statusCode: 400 });
    }
}

async function getAuthkey(organizationId) {
    const credentials = await Authkey.findOne({ organizationId });
    if (!credentials) {
        throw Object.assign(new Error("Authkey credentials have not been configured."), { statusCode: 404 });
    }
    return decrypt(credentials);
}

function getFirstValue(record, fields) {
    for (const field of fields) {
        const value = record?.[field];
        if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
    return "";
}

function getListName(moduleName) {
    const config = MODULE_CONFIG[moduleName];
    return process.env[config.listNameEnv] || config.defaultListName;
}

function normalizeMappings(mappings) {
    const seen = new Set();
    return (Array.isArray(mappings) ? mappings : [])
        .map(mapping => ({
            zohoField: String(mapping?.zohoField || "").trim(),
            payloadPath: String(mapping?.payloadPath || "").trim(),
            label: String(mapping?.label || "").trim()
        }))
        .filter(mapping => {
            if (!mapping.zohoField || !mapping.payloadPath) return false;
            const key = `${mapping.zohoField}:${mapping.payloadPath}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function setByPath(target, path, value) {
    const parts = String(path).split(".").map(part => part.trim()).filter(Boolean);
    if (!parts.length) return;

    let current = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index];
        if (!current[part] || typeof current[part] !== "object") current[part] = {};
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
}

function mapRecordToAuthkey(record, moduleName, authkey, mappings = []) {
    const config = MODULE_CONFIG[moduleName];
    const payload = {
        authkey,
        list_name: getListName(moduleName),
        source: "Zoho",
        country_code: process.env.DEFAULT_COUNTRY_CODE || "91"
    };

    for (const mapping of normalizeMappings(mappings)) {
        const value = record?.[mapping.zohoField];
        if (value !== undefined && value !== null && value !== "") {
            setByPath(payload, mapping.payloadPath, value);
        }
    }

    if (!payload.mobile) payload.mobile = getFirstValue(record, config.mobileFields);
    return payload;
}

function getHistoryData(payload) {
    const { authkey, ...safePayload } = payload;
    return safePayload;
}

function getZohoCrmBaseUrl(apiDomain) {
    const baseUrl = String(apiDomain || "").trim().replace(/\/crm\/v\d+$/i, "").replace(/\/$/, "");
    if (!baseUrl) throw new Error("Zoho API domain is required for bulk record fetching.");
    return `${baseUrl}/crm/v8`;
}

async function fetchRecordsPage(accessToken, apiDomain, moduleName, params) {
    const response = await axios.get(
        `${getZohoCrmBaseUrl(apiDomain)}/${encodeURIComponent(moduleName)}`,
        {
            params,
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            timeout: 30000
        }
    );
    return response.data;
}

async function fetchAllRecords(organizationId, moduleName) {
    const { accessToken, apiDomain } = await zohoOAuthService.getAccessToken(organizationId);
    const records = [];
    let page = 1;
    let pageToken = null;

    while (true) {
        const params = pageToken ? { page_token: pageToken } : { per_page: 200, page };
        const response = await fetchRecordsPage(accessToken, apiDomain, moduleName, params);
        if (Array.isArray(response.data)) records.push(...response.data);

        const info = response.info || {};
        if (info.next_page_token) {
            pageToken = info.next_page_token;
            continue;
        }
        if (!info.more_records) break;
        page += 1;
    }
    return records;
}

async function sendToAuthkey(payload) {
    const response = await axios.post(AUTHKEY_ADD_LIST_URL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
        validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
        const error = new Error(response.data?.message || response.data?.error || `Authkey returned HTTP ${response.status}.`);
        error.statusCode = response.status;
        error.providerResponse = response.data;
        throw error;
    }
    return response.data;
}

async function syncModule({ organizationId, module, mappings = [] }) {
    assertSupportedModule(module);
    if (!organizationId) {
        throw Object.assign(new Error("Zoho organization ID is required."), { statusCode: 400 });
    }

    const normalizedMappings = normalizeMappings(mappings);
    if (!normalizedMappings.length) {
        throw Object.assign(new Error("Select at least one Zoho field to send to Authkey."), { statusCode: 400 });
    }

    const authkey = await getAuthkey(organizationId);
    const records = await fetchAllRecords(organizationId, module);
    const summary = {
        success: true,
        module,
        mappings: normalizedMappings,
        total: records.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        failures: [],
        records: []
    };

    const concurrency = getBulkConcurrency(process.env.AUTHKEY_BULK_CONCURRENCY, 5);

    for (let start = 0; start < records.length; start += concurrency) {
        const batch = records.slice(start, start + concurrency);
        const results = await Promise.all(batch.map(async record => {
            const payload = mapRecordToAuthkey(record, module, authkey, normalizedMappings);
            const data = getHistoryData(payload);

            if (!payload.mobile) {
                return {
                    type: "skipped",
                    recordId: record.id,
                    reason: "No Mobile or Phone value found.",
                    data
                };
            }

            try {
                await sendToAuthkey(payload);
                return { type: "sent", recordId: record.id, data };
            } catch (error) {
                return {
                    type: "failed",
                    recordId: record.id,
                    error: error.message,
                    data
                };
            }
        }));

        for (const result of results) {
            summary.records.push(result);
            if (result.type === "sent") summary.sent += 1;
            else if (result.type === "skipped") {
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
    mapRecordToAuthkey,
    normalizeMappings
};
