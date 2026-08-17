let recordId = null;

let moduleName = null;

ZOHO.embeddedApp.on("PageLoad", async () => {

    await loadHistory();

});

ZOHO.embeddedApp.init();

async function loadHistory() {

    const channel =
        document.getElementById("channelFilter").value;

    const recipient =
        document.getElementById("search").value.trim();

    const params = new URLSearchParams();

    if (channel) {
        params.append("channel", channel);
    }

    if (recipient) {
        params.append("recipient", recipient);
    }

    const logs = await requestJson(`/api/history/${await getOrganizationId()}?${params}`);

    renderTable(logs);

}

async function viewDetails(id){

    const log = await requestJson(`/api/history/detail/${encodeURIComponent(id)}`);

    document.getElementById("details").innerHTML = `

<h3>Delivery Details</h3>

<table class="detailTable">

<tr>
<td>Channel</td>
<td>${log.channel}</td>
</tr>

<tr>
<td>Recipient</td>
<td>${log.recipient}</td>
</tr>

<tr>
<td>Template</td>
<td>${log.templateName || log.templateId}</td>
</tr>

<tr>
<td>Template ID</td>
<td>${log.templateId}</td>
</tr>

<tr>
<td>Status</td>
<td>${log.status}</td>
</tr>

<tr>
<td>Provider ID</td>
<td>${log.providerMessageId || "-"}</td>
</tr>

<tr>
<td>Created</td>
<td>${new Date(log.createdAt).toLocaleString()}</td>
</tr>

</table>

<h4>Provider Response</h4>

<pre>${JSON.stringify(log.payload, null, 2)}</pre>

`;

    document.getElementById("detailModal").style.display = "flex";

}

document
.getElementById("closeModal")
.onclick = () => {

    document.getElementById("detailModal").style.display = "none";

};
document
.getElementById("channelFilter")
.addEventListener("change", loadHistory);

document
.getElementById("search")
.addEventListener("input", loadHistory);

async function showDetails(event, id) {

    const log = await requestJson(`/api/history/detail/${encodeURIComponent(id)}`);

    const tooltip = document.getElementById("detailTooltip");

    tooltip.innerHTML = `

<b>Channel:</b> ${log.channel}<br>

<b>Recipient:</b> ${log.recipient}<br>

<b>Template:</b> ${log.templateName || log.templateId}<br>

<b>Status:</b> ${log.status}<br>

<b>Provider ID:</b> ${log.providerMessageId || "-"}<br>

<hr>

<pre style="white-space:pre-wrap;font-size:11px">

${JSON.stringify(log.payload,null,2)}

</pre>

`;

    tooltip.style.display = "block";

    tooltip.style.left = (event.pageX + 10) + "px";
    tooltip.style.top = (event.pageY + 10) + "px";

}

function hideDetails() {

    document.getElementById("detailTooltip").style.display = "none";

}

function renderTable(logs){

    const tbody =
        document.querySelector("#historyTable tbody");

    tbody.innerHTML="";

    logs.forEach(log=>{

        tbody.innerHTML += `

<tr>

<td>${new Date(log.createdAt).toLocaleString()}</td>

<td>${log.channel}</td>

<td>${log.recipient}</td>

<td>${log.templateName || log.templateId}</td>

<td>

<span class="${log.status}">

${log.status}

</span>

</td>

<td>

<button
class="viewBtn"
onclick="viewDetails('${log._id}')">

View

</button>

</td>

</tr>

`;

    });

}
