const axios = require("axios");
const Authkey = require("../models/Authkey");
const { decrypt } = require("../utils/crypto");

const CHANNELS = new Set(["whatsapp", "sms", "voice", "email", "rcs"]);

async function credentialsFor(organizationId) {
    const credentials = await Authkey.findOne({ organizationId });
    if (!credentials) throw Object.assign(new Error("Authkey credentials have not been configured."), { statusCode: 404 });
    return decrypt(credentials);
}

/**
 * Validate an Authkey without sending a customer message.
 * Authkey exposes the account balance endpoint, which requires a valid
 * account authkey and therefore works well as a lightweight credential check.
 */
async function validateAuthkey(authkey) {
    const value = String(authkey || "").trim();

    if (!value) {
        throw Object.assign(new Error("Authkey is required."), { statusCode: 400 });
    }

    try {
        const response = await axios.get(
            process.env.AUTHKEY_VALIDATE_URL || "https://console.authkey.io/restapi/getbalance.php",
            {
                params: { authkey: value },
                timeout: 10000,
                validateStatus: () => true
            }
        );

        const data = response.data;
        const text = typeof data === "string" ? data : JSON.stringify(data || {});
        const normalized = text.toLowerCase();

        if (response.status >= 200 && response.status < 300) {
            const explicitlyInvalid =
                normalized.includes("invalid authkey") ||
                normalized.includes("invalid api key") ||
                normalized.includes("authentication failed") ||
                normalized.includes("unauthorized") ||
                normalized.includes("not authorized") ||
                normalized.includes("wrong authkey");

            if (!explicitlyInvalid) {
                return { valid: true };
            }
        }

        return { valid: false };
    } catch (error) {
        throw Object.assign(
            new Error("Unable to validate Authkey right now. Please try again."),
            { statusCode: 502, cause: error }
        );
    }
}

async function listTemplates(organizationId, channel) {
    if (!CHANNELS.has(channel)) throw Object.assign(new Error("Unsupported channel."), { statusCode: 400 });
    const authkey = await credentialsFor(organizationId);
    const response = await axios.post(
        process.env.AUTHKEY_TEMPLATE_URL || "https://console.authkey.io/restapi/getAllTemplate.php",
        { channel },
        {
            headers: {
                Authorization: `Basic ${authkey}`,
                "Content-Type": "application/json"
            }
        }
    );

    return response.data;
}

async function sendMessage({ organizationId, channel, recipient, templateId, variables }) {
    if (!CHANNELS.has(channel)) throw Object.assign(new Error("Unsupported channel."), { statusCode: 400 });
    if (!recipient || !templateId) throw Object.assign(new Error("Recipient and template are required."), { statusCode: 400 });
    const authkey = await credentialsFor(organizationId);
    if (channel === "whatsapp") {
        const response = await axios.post(process.env.AUTHKEY_WHATSAPP_URL || "https://authkey.io/restapi/requestjson.php", { country_code: process.env.DEFAULT_COUNTRY_CODE || "91", mobile: recipient, wid: templateId, type: "text", bodyValues: variables || {} }, { headers: { Authorization: `Basic ${authkey}`, "Content-Type": "application/json" }, timeout: 15000 });
        return response.data;
    }
    if (channel === "sms") {
        const params = {
            authkey,
            mobile: recipient,
            country_code: process.env.DEFAULT_COUNTRY_CODE || "91",
            sid: templateId
        };

        Object.entries(variables || {}).forEach(([name, value]) => {
            params[`var${name.replace(/^var_?/, "")}`] = value;
        });

        const response = await axios.post(process.env.AUTHKEY_SMS_URL || "https://api.authkey.io/request", null, { params, timeout: 15000 });
        return response.data;
    }

    if (channel === "voice") {
        const params = {
            authkey,
            mobile: recipient,
            country_code: process.env.DEFAULT_COUNTRY_CODE || "91",
            vid: templateId
        };

        Object.entries(variables || {}).forEach(([key, value]) => {
            params[key] = value;
        });

        const response = await axios.post(
            process.env.AUTHKEY_VOICE_URL || "https://api.authkey.io/request",
            null,
            {
                params,
                timeout: 15000
            }
        );

        return response.data;
    }

    if (channel === "rcs") {
        const body = {
            version: "1.0",
            authkey,
            encrpt: "0",
            template_id: templateId,
            country_code: process.env.DEFAULT_COUNTRY_CODE || "91",
            is_unicode: 0,
            sender: process.env.RCS_SENDER || "AUTHKY",
            biz_extra: process.env.RCS_BIZ_EXTRA || "",
            messages: [
                {
                    dest: [recipient],
                    param: variables || {}
                }
            ]
        };

        const response = await axios.post(
            process.env.AUTHKEY_RCS_URL,
            body,
            {
                headers: {
                    "Content-Type": "application/json"
                },
                timeout: 15000
            }
        );

        return response.data;
    }

    if (channel === "email") {
        const body = {
            email: recipient,
            mid: templateId,
            ...(variables || {})
        };

        const response = await axios.post(
            "https://authkey.io/restapi/requestjson.php",
            body,
            {
                headers: {
                    Authorization: `Basic ${authkey}`,
                    "Content-Type": "application/json"
                },
                timeout: 15000
            }
        );

        return response.data;
    }

    throw Object.assign(new Error(`${channel} sending needs its Authkey endpoint configured before enabling it.`), { statusCode: 501 });
}

module.exports = {
    validateAuthkey,
    listTemplates,
    sendMessage
};