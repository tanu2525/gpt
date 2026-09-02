const axios = require("axios");
const crypto = require("crypto");
const ZohoConnection = require("../models/ZohoConnection");

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI;
const SCOPES = process.env.ZOHO_SCOPES;

function getAccountsUrl(apiDomain) {
    const domain = String(apiDomain || process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in").toLowerCase();

    if (domain.includes("zoho.eu")) return "https://accounts.zoho.eu";
    if (domain.includes("zoho.com.au")) return "https://accounts.zoho.com.au";
    if (domain.includes("zoho.jp")) return "https://accounts.zoho.jp";
    if (domain.includes("zoho.sg")) return "https://accounts.zoho.sg";
    if (domain.includes("zoho.in")) return "https://accounts.zoho.in";

    return "https://accounts.zoho.com";
}

function getCrmApiDomain(apiDomain) {
    const domain = String(apiDomain || process.env.ZOHO_API_DOMAIN || process.env.ZOHO_CRM_BASE_URL || "").toLowerCase();

    if (domain.includes("sandbox.zohoapis.eu")) return "https://sandbox.zohoapis.eu";
    if (domain.includes("sandbox.zohoapis.com.au")) return "https://sandbox.zohoapis.com.au";
    if (domain.includes("sandbox.zohoapis.jp")) return "https://sandbox.zohoapis.jp";
    if (domain.includes("sandbox.zohoapis.sg")) return "https://sandbox.zohoapis.sg";
    if (domain.includes("sandbox.zohoapis.in")) return "https://sandbox.zohoapis.in";
    if (domain.includes("sandbox.zohoapis.com")) return "https://sandbox.zohoapis.com";

    if (domain.includes("developer.zohoapis.eu")) return "https://developer.zohoapis.eu";
    if (domain.includes("developer.zohoapis.com.au")) return "https://developer.zohoapis.com.au";
    if (domain.includes("developer.zohoapis.jp")) return "https://developer.zohoapis.jp";
    if (domain.includes("developer.zohoapis.sg")) return "https://developer.zohoapis.sg";
    if (domain.includes("developer.zohoapis.in")) return "https://developer.zohoapis.in";
    if (domain.includes("developer.zohoapis.com")) return "https://developer.zohoapis.com";

    if (domain.includes("zohoapis.eu")) return "https://www.zohoapis.eu";
    if (domain.includes("zoho.com.au") || domain.includes("zohoapis.com.au")) return "https://www.zohoapis.com.au";
    if (domain.includes("zoho.jp") || domain.includes("zohoapis.jp")) return "https://www.zohoapis.jp";
    if (domain.includes("zoho.sg") || domain.includes("zohoapis.sg")) return "https://www.zohoapis.sg";
    if (domain.includes("zoho.in") || domain.includes("zohoapis.in")) return "https://www.zohoapis.in";

    return "https://www.zohoapis.com";
}

function getEnvironmentFromApiDomain(apiDomain) {
    const domain = String(apiDomain || "").toLowerCase();
    if (domain.includes("sandbox.zohoapis.")) return "sandbox";
    if (domain.includes("developer.zohoapis.")) return "developer";
    if (domain.includes("zohoapis.")) return "production";
    return "unknown";
}

function createState(organizationId, apiDomain) {
    const payload = {
        organizationId: String(organizationId),
        redirectUri: REDIRECT_URI,
        accountsDomain: getAccountsUrl(apiDomain),
        requestedApiDomain: getCrmApiDomain(apiDomain),
        issuedAt: Date.now()
    };

    const stateSecret = process.env.ZOHO_OAUTH_STATE_SECRET || CLIENT_SECRET;
    if (!stateSecret) throw new Error("Zoho OAuth state secret is not configured.");

    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", stateSecret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
}

function getOrganizationFromState(state) {
    if (!state) throw new Error("Zoho OAuth state is required.");

    const parts = String(state).split(".");
    if (parts.length !== 2) throw new Error("Invalid Zoho OAuth state.");

    const [encoded, signature] = parts;
    const stateSecret = process.env.ZOHO_OAUTH_STATE_SECRET || CLIENT_SECRET;
    if (!stateSecret) throw new Error("Zoho OAuth state secret is not configured.");

    const expectedSignature = crypto.createHmac("sha256", stateSecret).update(encoded).digest("base64url");

    if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        throw new Error("Invalid Zoho OAuth state.");
    }

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.organizationId || !payload.redirectUri) {
        throw new Error("Invalid Zoho OAuth state payload.");
    }

    return payload;
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

async function exchangeCode(code, redirectUri = REDIRECT_URI, accountsDomain) {
    if (!code) throw new Error("Zoho authorization code is required.");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Zoho OAuth client credentials are not configured.");

    const accountsUrl = getAccountsUrl(accountsDomain);
    const response = await axios.post(`${accountsUrl}/oauth/v2/token`, null, {
        params: {
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            redirect_uri: redirectUri
        }
    });

    return response.data;
}

async function saveRefreshToken({ organizationId, refreshToken, apiDomain, scope }) {
    if (!organizationId) throw new Error("organizationId is required.");
    if (!refreshToken) throw new Error("refreshToken is required.");

    const resolvedApiDomain = getCrmApiDomain(apiDomain);

    return ZohoConnection.findOneAndUpdate(
        { organizationId: String(organizationId) },
        {
            organizationId: String(organizationId),
            refreshToken,
            apiDomain: resolvedApiDomain,
            environment: getEnvironmentFromApiDomain(resolvedApiDomain),
            scope: scope || "",
            connectedAt: new Date()
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
}

async function getConnectionStatus(organizationId) {
    const connection = await ZohoConnection.findOne({ organizationId: String(organizationId) })
        .select("organizationId apiDomain environment scope connectedAt");

    if (!connection) {
        return { connected: false };
    }

    return {
        connected: true,
        organizationId: connection.organizationId,
        apiDomain: connection.apiDomain,
        environment: connection.environment,
        scope: connection.scope,
        connectedAt: connection.connectedAt
    };
}

async function getAccessToken(organizationId) {
    const connection = await ZohoConnection.findOne({ organizationId: String(organizationId) }).select("+refreshToken");

    if (!connection) {
        const error = new Error("Zoho CRM is not connected for this organization. Connect this Zoho organization before creating workflows.");
        error.statusCode = 401;
        throw error;
    }

    if (!connection.refreshToken) throw new Error("Zoho refresh token is missing for this organization.");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Zoho OAuth client credentials are not configured.");

    const apiDomain = getCrmApiDomain(connection.apiDomain);
    const accountsUrl = getAccountsUrl(apiDomain);

    const response = await axios.post(`${accountsUrl}/oauth/v2/token`, null, {
        params: {
            refresh_token: connection.refreshToken,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: "refresh_token"
        }
    });

    // Zoho returns the authoritative API domain for the token/environment.
    const tokenApiDomain = getCrmApiDomain(response.data.api_domain || apiDomain);

    if (tokenApiDomain !== connection.apiDomain) {
        connection.apiDomain = tokenApiDomain;
        connection.environment = getEnvironmentFromApiDomain(tokenApiDomain);
        await connection.save();
    }

    return {
        accessToken: response.data.access_token,
        apiDomain: tokenApiDomain,
        environment: getEnvironmentFromApiDomain(tokenApiDomain)
    };
}

module.exports = {
    createAuthorizationUrl,
    getOrganizationFromState,
    exchangeCode,
    saveRefreshToken,
    getConnectionStatus,
    getAccessToken,
    getCrmApiDomain,
    getEnvironmentFromApiDomain
};
