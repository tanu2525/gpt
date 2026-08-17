async function requestJson(url, options = {}) {
    const response = await fetch(getApiUrl(url), options);
    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("The server returned an invalid response.");
    }

    if (!response.ok) {
        throw new Error(data.message || data.error || "The request could not be completed.");
    }

    return data;
}

function getApiUrl(url) {
    // Locally the app lives at /app; production is hosted below /v6/api/app.
    if (!url.startsWith("/")) return url;
    const match = window.location.pathname.match(/^(.*)\/app(?:\/|$)/);
    if (!match || !match[1]) return url;

    // The deployed base already ends in /api, so remove the local-only API prefix.
    const endpoint = url === "/api" ? "" : url.replace(/^\/api(?=\/)/, "");
    return match[1] + endpoint;
}

async function getChannelTemplates(channel) {
    const organizationId = await getOrganizationId();
    const path = `/api/templates/${encodeURIComponent(organizationId)}?channel=${encodeURIComponent(channel)}`;
    return requestJson(path);
}
