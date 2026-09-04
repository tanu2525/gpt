let currentConfiguration = null;

function showConfigurationForm() {
    document.getElementById("configurationForm").classList.remove("hidden");
    document.getElementById("configuredView").classList.add("hidden");
    document.getElementById("authkey").value = "";

    if (currentConfiguration?.email) {
        document.getElementById("email").value = currentConfiguration.email;
    }
}

function showConfiguredView(configuration) {
    currentConfiguration = configuration;

    document.getElementById("configurationForm").classList.add("hidden");
    document.getElementById("configuredView").classList.remove("hidden");
    document.getElementById("configuredEmail").textContent = configuration.email || "-";
    document.getElementById("configuredAuthkey").textContent = configuration.maskedAuthkey || "Configured";
}

async function loadSettings() {
    const id = await getOrganizationId();

    try {
        const response = await requestJson(`/api/authkey/${encodeURIComponent(id)}`);

        // Existing installations saved before the email field was introduced
        // must provide their Authkey account email once before showing the summary.
        if (response.configured && response.email) {
            showConfiguredView(response);
            setStatus("", "status");
        } else {
            currentConfiguration = response;
            showConfigurationForm();
            setStatus("Please enter the email associated with your Authkey account.", "status");
        }
    } catch (error) {
        if (!/Authkey not found/i.test(error.message)) throw error;
        currentConfiguration = null;
        showConfigurationForm();
    }
}

async function saveAuthkey() {
    const emailInput = document.getElementById("email");
    const authkeyInput = document.getElementById("authkey");

    const email = emailInput.value.trim();
    const authkey = authkeyInput.value.trim();

    if (!email) {
        setStatus("Enter the email associated with your Authkey account.", "status");
        emailInput.focus();
        return;
    }

    if (!emailInput.checkValidity()) {
        setStatus("Enter a valid email address.", "status");
        emailInput.focus();
        return;
    }

    if (!authkey) {
        setStatus("Enter an Authkey to save or update it.", "status");
        authkeyInput.focus();
        return;
    }

    setStatus("Validating Authkey...", "status");

    try {
        const response = await requestJson("/api/authkey/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                organizationId: await getOrganizationId(),
                email,
                authkey
            })
        });

        authkeyInput.value = "";
        showConfiguredView({
            configured: true,
            email: response.email || email,
            maskedAuthkey: "••••••••••••"
        });
        setStatus(response.message || "Authkey saved successfully.", "status");
    } catch (error) {
        if (/INVALID_AUTHKEY|Invalid Authkey/i.test(`${error.code || ""} ${error.message || ""}`)) {
            setStatus("Invalid Authkey. Please enter a valid Authkey.", "status");
            authkeyInput.focus();
            return;
        }

        setStatus(error.message || "Unable to save Authkey.", "status");
    }
}

ZOHO.embeddedApp.on("PageLoad", () => loadSettings().catch(error => setStatus(error.message, "status")));
document.getElementById("saveBtn").addEventListener("click", saveAuthkey);
document.getElementById("changeBtn").addEventListener("click", () => {
    showConfigurationForm();
    setStatus("Update the email or Authkey and save the changes.", "status");
});
ZOHO.embeddedApp.init();
