const axios = require("axios");
const crypto = require("crypto");
const ZohoConnection = require("../models/ZohoConnection");

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI;
const SCOPES = process.env.ZOHO_SCOPES;

function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/$/, "");
}

function getAccountsUrl(apiDomain) {
    const domain = normalizeUrl(apiDomain).toLowerCase();

    if (!domain) {
        throw new Error("Zoho API domain is required to determine the correct Zoho Accounts server.");
    }

    if (domain.includes("zohoapis.eu") || domain.includes("zoho.eu")) return "https://accounts.zoho.eu";
    if (domain.includes("zohoapis.com.au") || domain.includes("zoho.com.au")) return "https://accounts.zoho.com.au";
    if (domain.includes("zohoapis.jp") || domain.includes("zoho.jp")) return "https://accounts.zoho.jp";
    if (domain.includes("zohoapis.sg") || domain.includes("zoho.sg")) return "https://accounts.zoho.sg";
    if (domain.includes("zohoapis.in") || domain.includes("zoho.in")) return "https://accounts.zoho.in";

    return "https://accounts.zoho.com";
}

function getCrmApiDomain(apiDomain) {
    const domain = normalizeUrl(apiDomain).toLowerCase();

    if (!domain) {
        throw new Error("Zoho API domain is missing.");
    }

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

    if (domain.includes("zohoapis.eu") || domain.includes("zoho.eu")) return "https://www.zohoapis.eu";
    if (domain.includes("zohoapis.com.au") || domain.includes("zoho.com.au")) return "https://www.zohoapis.com.au";
    if (domain.includes("zohoapis.jp") || domain.includes("zoho.jp")) return "https://www.zohoapis.jp";
    if (domain.includes("zohoapis.sg") || domain.includes("zoho.sg")) return "https://www.zohoapis.sg";
    if (domain.includes("zohoapis.in") || domain.includes("zoho.in")) return "https://www.zohoapis.in";

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
    const requestedApiDomain = getCrmApiDomain(apiDomain);
    const payload = {
        organizationId: String(organizationId),
        redirectUri: REDIRECT_URI,
        requestedApiDomain,
        accountsDomain: getAccountsUrl(requestedApiDomain),
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
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        throw new Error("Invalid Zoho OAuth state.");
    }

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.organizationId || !payload.redirectUri || !payload.requestedApiDomain) {
        throw new Error("Invalid Zoho OAuth state payload.");
    }

    return payload;
}

function createAuthorizationUrl(organizationId, apiDomain) {
    if (!CLIENT_ID) throw new Error("ZOHO_CLIENT_ID is not configured.");
    if (!REDIRECT_URI) throw new Error("ZOHO_REDIRECT_URI is not configured.");
    if (!SCOPES) throw new Error("ZOHO_SCOPES is not configured.");
    if (!apiDomain) throw new Error("Zoho API domain could not be detected from the current CRM organization.");

    const requestedApiDomain = getCrmApiDomain(apiDomain);
    const accountsUrl = getAccountsUrl(requestedApiDomain);
    const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        access_type: "offline",
        prompt: "consent",
        state: createState(organizationId, requestedApiDomain)
    });

    return `${accountsUrl}/oauth/v2/auth?${params.toString()}`;
}

async function exchangeCode(code, redirectUri = REDIRECT_URI, accountsDomain) {
    if (!code) throw new Error("Zoho authorization code is required.");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Zoho OAuth client credentials are not configured.");
    if (!accountsDomain) throw new Error("Zoho Accounts server is missing for authorization-code exchange.");

    const accountsUrl = normalizeUrl(accountsDomain);
    const requestBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUri
    });

    const response = await axios.post(`${accountsUrl}/oauth/v2/token`, requestBody.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    if (!response.data.access_token) {
        throw new Error(`Zoho did not return an access token: ${response.data.error || "Unknown error"}`);
    }

    return response.data;
}

async function saveRefreshToken({ organizationId, refreshToken, apiDomain, scope }) {
    if (!organizationId) throw new Error("organizationId is required.");
    if (!refreshToken) throw new Error("refreshToken is required.");
    if (!apiDomain) throw new Error("Zoho did not return an API domain for this connection.");

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
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    );
}

async function getConnectionStatus(organizationId) {
    const connection = await ZohoConnection.findOne({ organizationId: String(organizationId) })
        .select("organizationId apiDomain environment scope connectedAt");

    if (!connection) return { connected: false };

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
    if (!connection.apiDomain) throw new Error("Stored Zoho API domain is missing. Reconnect Zoho CRM.");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Zoho OAuth client credentials are not configured.");

    const storedApiDomain = getCrmApiDomain(connection.apiDomain);
    const accountsUrl = getAccountsUrl(storedApiDomain);

    const response = await axios.post(`${accountsUrl}/oauth/v2/token`, null, {
        params: {
            refresh_token: connection.refreshToken,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: "refresh_token"
        }
    });

    if (!response.data.access_token) {
        throw new Error(`Unable to generate Zoho access token: ${response.data.error || "Unknown error"}`);
    }

    const tokenApiDomain = getCrmApiDomain(response.data.api_domain || storedApiDomain);

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
    getAccountsUrl,
    getCrmApiDomain,
    getEnvironmentFromApiDomain
};
