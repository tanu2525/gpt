async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
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

async function getChannelTemplates(channel) {
    const organizationId = await getOrganizationId();
    const path = `/api/templates/${encodeURIComponent(organizationId)}?channel=${encodeURIComponent(channel)}`;
    return requestJson(path);
}
