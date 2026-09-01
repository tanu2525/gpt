let recordId = null;
let moduleName = null;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

ZOHO.embeddedApp.on("PageLoad", async () => {
    try {
        if (!(await ensureAuthkeyConfigured())) return;
        await loadHistory();
    } catch (error) {
        console.error(error);
    }
});

ZOHO.embeddedApp.init();

async function loadHistory() {
    const channel = document.getElementById("channelFilter").value;
    const recipient = document.getElementById("search").value.trim();
    const params = new URLSearchParams();

    if (channel) params.append("channel", channel);
    if (recipient) params.append("recipient", recipient);

    const logs = await requestJson(`/api/history/${await getOrganizationId()}?${params}`);
    renderTable(logs);
}

async function viewDetails(id) {
    const log = await requestJson(`/api/history/detail/${encodeURIComponent(id)}`);

    document.getElementById("details").innerHTML = `
<h3>Delivery Details</h3>
<table class="detailTable">
<tr><td>Channel</td><td>${escapeHtml(log.channel)}</td></tr>
<tr><td>Recipient</td><td>${escapeHtml(log.recipient)}</td></tr>
<tr><td>Template</td><td>${escapeHtml(log.templateName || log.templateId)}</td></tr>
<tr><td>Template ID</td><td>${escapeHtml(log.templateId)}</td></tr>
<tr><td>Status</td><td>${escapeHtml(log.status)}</td></tr>
<tr><td>Provider ID</td><td>${escapeHtml(log.providerMessageId || "-")}</td></tr>
<tr><td>Created</td><td>${new Date(log.createdAt).toLocaleString()}</td></tr>
</table>
<h4>Provider Response</h4>
<pre>${escapeHtml(JSON.stringify(log.payload, null, 2))}</pre>`;

    document.getElementById("detailModal").style.display = "flex";
}

document.getElementById("closeModal").onclick = () => {
    document.getElementById("detailModal").style.display = "none";
};
document.getElementById("channelFilter").addEventListener("change", () => loadHistory().catch(console.error));
document.getElementById("search").addEventListener("input", () => loadHistory().catch(console.error));

async function showDetails(event, id) {
    const log = await requestJson(`/api/history/detail/${encodeURIComponent(id)}`);
    const tooltip = document.getElementById("detailTooltip");

    tooltip.innerHTML = `
<b>Channel:</b> ${escapeHtml(log.channel)}<br>
<b>Recipient:</b> ${escapeHtml(log.recipient)}<br>
<b>Template:</b> ${escapeHtml(log.templateName || log.templateId)}<br>
<b>Status:</b> ${escapeHtml(log.status)}<br>
<b>Provider ID:</b> ${escapeHtml(log.providerMessageId || "-")}<br>
<hr>
<pre style="white-space:pre-wrap;font-size:11px">${escapeHtml(JSON.stringify(log.payload, null, 2))}</pre>`;

    tooltip.style.display = "block";
    tooltip.style.left = (event.pageX + 10) + "px";
    tooltip.style.top = (event.pageY + 10) + "px";
}

function hideDetails() {
    document.getElementById("detailTooltip").style.display = "none";
}

function renderTable(logs) {
    const tbody = document.querySelector("#historyTable tbody");
    tbody.innerHTML = "";

    logs.forEach(log => {
        tbody.innerHTML += `
<tr>
<td>${new Date(log.createdAt).toLocaleString()}</td>
<td>${escapeHtml(log.channel)}</td>
<td>${escapeHtml(log.recipient)}</td>
<td>${escapeHtml(log.templateName || log.templateId)}</td>
<td><span class="${escapeHtml(log.status)}">${escapeHtml(log.status)}</span></td>
<td><button class="viewBtn" onclick="viewDetails('${escapeHtml(log._id)}')">View</button></td>
</tr>`;
    });
}
