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
    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    const match = window.location.pathname.match(/^(.+)\/app(?:\/|$)/);

    if (!match) {
        return url;
    }
    const baseUrl = window.location.origin + match[1];

    const endpoint = url.startsWith("/")
        ? url
        : `/${url}`;

    return baseUrl + endpoint;
}

async function getChannelTemplates(channel) {
    const organizationId = await getOrganizationId();
    const path = `/api/templates/${encodeURIComponent(organizationId)}?channel=${encodeURIComponent(channel)}`;
    return requestJson(path);
}
