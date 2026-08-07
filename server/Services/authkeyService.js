const axios = require("axios");
const Authkey = require("../models/Authkey");
const { decrypt } = require("../utils/crypto");

const CHANNELS = new Set(["whatsapp", "sms","voice", "email", "rcs"]);

async function credentialsFor(organizationId) {
    const credentials = await Authkey.findOne({ organizationId });
    if (!credentials) throw Object.assign(new Error("Authkey credentials have not been configured."), { statusCode: 404 });
    return decrypt(credentials);
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
   
        // Authkey SMS templates use query-string variables such as var1=Alice.
        Object.entries(variables || {}).forEach(([name, value]) => {
            params[`var${name.replace(/^var_?/, "")}`] = value;
        });
        // Authkey documents approved-template SMS sending as POST with query parameters.
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
    listTemplates,
    sendMessage
};