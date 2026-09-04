const AUTHKEY_EXTENSION_API_BASE_URL =
    window.AUTHKEY_EXTENSION_API_BASE_URL ||
    "https://augmented-carefully-unseeing.ngrok-free.dev";

async function requestJson(url, options = {}) {
    const apiUrl = getApiUrl(url);
    const response = await fetch(apiUrl, options);
    const responseText = await response.text();
    let data = null;

    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error(
                `The server returned an invalid response (HTTP ${response.status}).`
            );
        }
    }

    if (!response.ok) {
        throw new Error(
            data?.message ||
            data?.error ||
            `The request could not be completed (HTTP ${response.status}).`
        );
    }

    return data;
}

function getApiUrl(url) {
    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    const endpoint = url.startsWith("/") ? url : `/${url}`;

    if (AUTHKEY_EXTENSION_API_BASE_URL) {
        return `${String(AUTHKEY_EXTENSION_API_BASE_URL).replace(/\/$/, "")}${endpoint}`;
    }

    return window.location.origin + endpoint;
}

async function getChannelTemplates(channel) {
    const organizationId = await getOrganizationId();
    const path = `/api/templates/${encodeURIComponent(organizationId)}?channel=${encodeURIComponent(channel)}`;
    return requestJson(path);
}
