async function loadSettings() {
    const id = await getOrganizationId();
    try {
        await requestJson(`/api/authkey/${encodeURIComponent(id)}`);
        setStatus("Credentials are configured. Leave the field blank to keep the current value.", "status");
    } catch (error) {
        if (!/Authkey not found/i.test(error.message)) throw error;
    }
}

async function saveAuthkey() {
    const authkey = document.getElementById("authkey").value.trim();
    if (!authkey) { setStatus("Enter an Authkey to save or rotate it.", "status"); return; }
    setStatus("Saving...", "status");
    await requestJson("/api/authkey/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: await getOrganizationId(), authkey })
    });
    setStatus("Credentials saved securely.", "status");
    document.getElementById("authkey").value = "";
}

ZOHO.embeddedApp.on("PageLoad", () => loadSettings().catch(error => setStatus(error.message, "status")));
document.getElementById("saveBtn").addEventListener("click", () => saveAuthkey().catch(error => setStatus(error.message, "status")));
ZOHO.embeddedApp.init();
