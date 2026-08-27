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
    const input = document.getElementById("authkey");
    const authkey = input.value.trim();

    if (!authkey) {
        setStatus("Enter an Authkey to save or rotate it.", "status");
        return;
    }

    setStatus("Validating Authkey...", "status");

    try {
        const response = await requestJson("/api/authkey/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                organizationId: await getOrganizationId(),
                authkey
            })
        });

        setStatus(response.message || "Authkey saved successfully.", "status");
        input.value = "";
    } catch (error) {
        if (/INVALID_AUTHKEY|Invalid Authkey/i.test(`${error.code || ""} ${error.message || ""}`)) {
            setStatus("Invalid Authkey. Please enter a valid Authkey.", "status");
            input.focus();
            return;
        }

        setStatus(error.message || "Unable to save Authkey.", "status");
    }
}

ZOHO.embeddedApp.on("PageLoad", () => loadSettings().catch(error => setStatus(error.message, "status")));
document.getElementById("saveBtn").addEventListener("click", saveAuthkey);
ZOHO.embeddedApp.init();
