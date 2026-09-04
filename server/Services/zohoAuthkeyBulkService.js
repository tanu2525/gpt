const axios = require("axios");

const Authkey = require("../models/Authkey");
const zohoOAuthService = require("./zohoOAuthService");
const { decrypt } = require("../utils/crypto");

const AUTHKEY_ADD_LIST_URL =
    process.env.AUTHKEY_ADD_LIST_DATA_URL ||
    "https://console.authkey.io/restapi/addlistdata.php";

const SUPPORTED_MODULES = new Set(["Leads", "Contacts", "Accounts"]);

const MODULE_CONFIG = {
    Leads: { mobileFields: ["Mobile", "Phone"] },
    Contacts: { mobileFields: ["Mobile", "Phone"] },
    Accounts: { mobileFields: ["Phone", "Mobile"] }
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

function getPrimitiveValue(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "object") {
        return String(value.name || value.id || "").trim();
    }

    return String(value).trim();
}

function getFirstValue(record, fields) {
    for (const field of fields) {
        const value = getPrimitiveValue(record?.[field]);
        if (value) return value;
    }

    return "";
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

function setByPath(target, path, value, overwrite = false) {
    const parts = String(path)
        .split(".")
        .map(part => part.trim())
        .filter(Boolean);

    if (!parts.length) return;

    let current = target;

    for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index];

        if (!current[part] || typeof current[part] !== "object") {
            current[part] = {};
        }

        current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    const existing = getPrimitiveValue(current[lastPart]);

    if (overwrite || !existing) {
        current[lastPart] = value;
    }
}

function normalizeMobile(value) {
    const raw = getPrimitiveValue(value);
    if (!raw) return "";

    const digits = raw.replace(/\D/g, "");
    return digits.length >= 6 && digits.length <= 15 ? digits : "";
}

function mapRecordToAuthkey(record, moduleName, authkey, listName, mappings = []) {
    const config = MODULE_CONFIG[moduleName];
    const payload = {
        authkey,
        list_name: listName,
        source: "Zoho",
        country_code: process.env.DEFAULT_COUNTRY_CODE || "91"
    };

    for (const mapping of normalizeMappings(mappings)) {
        const value = getPrimitiveValue(record?.[mapping.zohoField]);

        if (value) {
            setByPath(payload, mapping.payloadPath, value);
        }
    }

    const mappedMobile = normalizeMobile(payload.mobile);
    const fallbackMobile = normalizeMobile(
        getFirstValue(record, config?.mobileFields || [])
    );

    payload.mobile = mappedMobile || fallbackMobile;

    return payload;
}

function getZohoCrmBaseUrl(apiDomain) {
    const baseUrl = String(apiDomain || "")
        .trim()
        .replace(/\/crm\/v\d+$/i, "")
        .replace(/\/$/, "");

    if (!baseUrl) {
        throw new Error("Zoho API domain is required for bulk record fetching.");
    }

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

function getRequestedZohoFields(moduleName, mappings = []) {
    const selectedFields = normalizeMappings(mappings)
        .map(mapping => mapping.zohoField)
        .filter(Boolean);

    const fallbackFields = MODULE_CONFIG[moduleName]?.mobileFields || [];
    return [...new Set([...selectedFields, ...fallbackFields])];
}

async function fetchAllRecords(organizationId, moduleName, mappings = []) {
    const { accessToken, apiDomain } = await zohoOAuthService.getAccessToken(organizationId);
    const fields = getRequestedZohoFields(moduleName, mappings);

    if (!fields.length) {
        throw Object.assign(
            new Error("Select at least one Zoho CRM field before fetching records."),
            { statusCode: 400 }
        );
    }

    const records = [];
    let page = 1;
    let pageToken = null;

    while (true) {
        const params = pageToken
            ? { page_token: pageToken, fields: fields.join(",") }
            : { per_page: 200, page, fields: fields.join(",") };

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

        if (!info.more_records) break;
        page += 1;
    }

    return records;
}

function isProviderSuccess(data) {
    if (data === true) return true;
    if (!data || typeof data !== "object") return false;

    if (data.success === true) return true;
    if (String(data.status || "").trim().toLowerCase() === "success") return true;
    if (String(data.status || "").trim().toLowerCase() === "sent") return true;
    if (String(data.result || "").trim().toLowerCase() === "success") return true;

    return false;
}

function getProviderError(data, status) {
    if (data && typeof data === "object") {
        const message = data.message || data.error || data.error_message || data.reason;
        if (message) return String(message);
    }

    return `Authkey did not confirm that the contact was added${status ? ` (HTTP ${status})` : ""}.`;
}

async function sendToAuthkey(payload) {
    const response = await axios.post(AUTHKEY_ADD_LIST_URL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
        validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
        const error = new Error(getProviderError(response.data, response.status));
        error.statusCode = response.status;
        error.providerResponse = response.data;
        throw error;
    }

    if (!isProviderSuccess(response.data)) {
        const error = new Error(getProviderError(response.data, response.status));
        error.statusCode = 502;
        error.providerResponse = response.data;
        throw error;
    }

    return response.data;
}

async function sendPreparedRecord({ authkey, module, record, listName, mappings }) {
    const payload = mapRecordToAuthkey(
        record,
        module,
        authkey,
        listName,
        mappings
    );

    if (!payload.mobile) {
        return {
            status: "skipped",
            recordId: record?.id || null,
            reason: "The CRM record does not contain a valid Mobile or Phone number."
        };
    }

    const providerResponse = await sendToAuthkey(payload);

    return {
        status: "sent",
        recordId: record?.id || null,
        providerResponse
    };
}

async function sendRecordToContactList({ organizationId, module, record, listName, mappings = [] }) {
    assertSupportedModule(module);

    const normalizedListName = String(listName || "").trim();
    if (!normalizedListName) {
        throw Object.assign(new Error("Authkey contact list name is required."), { statusCode: 400 });
    }

    const normalizedMappings = normalizeMappings(mappings);
    if (!normalizedMappings.length) {
        throw Object.assign(new Error("At least one contact field mapping is required."), { statusCode: 400 });
    }

    const authkey = await getAuthkey(organizationId);
    const result = await sendPreparedRecord({
        authkey,
        module,
        record,
        listName: normalizedListName,
        mappings: normalizedMappings
    });

    if (result.status === "skipped") {
        throw Object.assign(new Error(result.reason), { statusCode: 400 });
    }

    return {
        recordId: result.recordId,
        listName: normalizedListName,
        providerResponse: result.providerResponse
    };
}

async function syncModule({ organizationId, module, listName, mappings = [] }) {
    assertSupportedModule(module);

    if (!organizationId) {
        throw Object.assign(
            new Error("Zoho organization ID is required."),
            { statusCode: 400 }
        );
    }

    const normalizedListName = String(listName || "").trim();
    if (!normalizedListName) {
        throw Object.assign(
            new Error("Enter the Authkey contact list name."),
            { statusCode: 400 }
        );
    }

    const normalizedMappings = normalizeMappings(mappings);
    if (!normalizedMappings.length) {
        throw Object.assign(
            new Error("Select at least one Zoho field to send to Authkey."),
            { statusCode: 400 }
        );
    }

    const [authkey, records] = await Promise.all([
        getAuthkey(organizationId),
        fetchAllRecords(organizationId, module, normalizedMappings)
    ]);

    const summary = {
        success: true,
        module,
        listName: normalizedListName,
        mappings: normalizedMappings,
        total: records.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        failures: []
    };

    for (const record of records) {
        try {
            const result = await sendPreparedRecord({
                authkey,
                module,
                record,
                listName: normalizedListName,
                mappings: normalizedMappings
            });

            if (result.status === "sent") {
                summary.sent += 1;
            } else {
                summary.skipped += 1;
                summary.failures.push({
                    recordId: result.recordId,
                    reason: result.reason,
                    type: "skipped"
                });
            }
        } catch (error) {
            summary.failed += 1;
            summary.failures.push({
                recordId: record?.id || null,
                reason: String(error.message || "Authkey rejected the contact."),
                type: "failed"
            });
        }
    }

    summary.success = summary.failed === 0;
    return summary;
}

module.exports = {
    syncModule,
    sendRecordToContactList,
    fetchAllRecords,
    mapRecordToAuthkey,
    normalizeMappings,
    getRequestedZohoFields
};
