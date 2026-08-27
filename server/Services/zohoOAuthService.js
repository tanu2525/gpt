const axios = require("axios");
const crypto = require("crypto");
const ZohoConnection = require("../models/ZohoConnection");

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI;
const SCOPES = process.env.ZOHO_SCOPES;

function getAccountsUrl(apiDomain) {
    const domain = String(
        apiDomain || process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in"
    ).toLowerCase();

    if (domain.includes("zoho.eu")) return "https://accounts.zoho.eu";
    if (domain.includes("zoho.com.au")) return "https://accounts.zoho.com.au";
    if (domain.includes("zoho.jp")) return "https://accounts.zoho.jp";
    if (domain.includes("zoho.sg")) return "https://accounts.zoho.sg";
    if (domain.includes("zoho.in")) return "https://accounts.zoho.in";
    return "https://accounts.zoho.com";
}

function getCrmApiDomain(apiDomain) {
    const domain = String(apiDomain || "").toLowerCase();

    if (domain.includes("zoho.eu")) return "https://www.zohoapis.eu";
    if (domain.includes("zoho.com.au")) return "https://www.zohoapis.com.au";
    if (domain.includes("zoho.jp")) return "https://www.zohoapis.jp";
    if (domain.includes("zoho.sg")) return "https://www.zohoapis.sg";
    if (domain.includes("zoho.in")) return "https://www.zohoapis.in";
    if (domain.includes("zohoapis.eu")) return "https://www.zohoapis.eu";
    if (domain.includes("zohoapis.com.au")) return "https://www.zohoapis.com.au";
    if (domain.includes("zohoapis.jp")) return "https://www.zohoapis.jp";
    if (domain.includes("zohoapis.sg")) return "https://www.zohoapis.sg";
    if (domain.includes("zohoapis.in")) return "https://www.zohoapis.in";

    return "https://www.zohoapis.com";
}

function createState(organizationId, apiDomain) {
    const payload = {
        organizationId: String(organizationId),
        redirectUri: REDIRECT_URI,
        accountsDomain: getAccountsUrl(apiDomain),
        crmApiDomain: getCrmApiDomain(apiDomain),
        issuedAt: Date.now()
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
        .createHmac("sha256", process.env.WEBHOOK_SECRET || CLIENT_SECRET)
        .update(encoded)
        .digest("base64url");

    return `${encoded}.${signature}`;
}

function getOrganizationFromState(state) {
    if (!state) throw new Error("Zoho OAuth state is required.");

    const parts = String(state).split(".");
    if (parts.length !== 2) throw new Error("Invalid Zoho OAuth state.");

    const [encoded, signature] = parts;
    const expectedSignature = crypto
        .createHmac("sha256", process.env.WEBHOOK_SECRET || CLIENT_SECRET)
        .update(encoded)
        .digest("base64url");

    if (
        signature.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
        throw new Error("Invalid Zoho OAuth state.");
    }

    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

function createAuthorizationUrl(organizationId, apiDomain) {
    if (!CLIENT_ID) throw new Error("ZOHO_CLIENT_ID is not configured.");
    if (!REDIRECT_URI) throw new Error("ZOHO_REDIRECT_URI is not configured.");
    if (!SCOPES) throw new Error("ZOHO_SCOPES is not configured.");

    const accountsUrl = getAccountsUrl(apiDomain);

    const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        access_type: "offline",
        prompt: "consent",
        state: createState(organizationId, apiDomain)
    });

    return `${accountsUrl}/oauth/v2/auth?${params.toString()}`;
}

async function exchangeCode(code, redirectUri = REDIRECT_URI, apiDomain) {
    if (!code) throw new Error("Zoho authorization code is required.");

    const response = await axios.post(
        `${getAccountsUrl(apiDomain)}/oauth/v2/token`,
        null,
        {
            params: {
                grant_type: "authorization_code",
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
                redirect_uri: redirectUri
            }
        }
    );

    return response.data;
}

async function saveRefreshToken({ organizationId, refreshToken, apiDomain, scope }) {
    if (!organizationId) throw new Error("organizationId is required.");
    if (!refreshToken) throw new Error("refreshToken is required.");

    return ZohoConnection.findOneAndUpdate(
        { organizationId: String(organizationId) },
        {
            organizationId: String(organizationId),
            refreshToken,
            apiDomain: getCrmApiDomain(apiDomain),
            scope: scope || "",
            connectedAt: new Date()
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
}

async function getAccessToken(organizationId) {
    const connection = await ZohoConnection.findOne({
        organizationId: String(organizationId)
    }).select("+refreshToken");

    if (!connection) {
        throw new Error(
            "Zoho CRM is not connected for this organization. Open the Zoho OAuth connect URL first."
        );
    }

    if (!connection.refreshToken) {
        throw new Error("Zoho refresh token is missing for this organization.");
    }

    const apiDomain = getCrmApiDomain(connection.apiDomain);

    const response = await axios.post(
        `${getAccountsUrl(apiDomain)}/oauth/v2/token`,
        null,
        {
            params: {
                refresh_token: connection.refreshToken,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "refresh_token"
            }
        }
    );

    return {
        accessToken: response.data.access_token,
        apiDomain
    };
}

module.exports = {
    createAuthorizationUrl,
    getOrganizationFromState,
    exchangeCode,
    saveRefreshToken,
    getAccessToken,
    getCrmApiDomain
};
