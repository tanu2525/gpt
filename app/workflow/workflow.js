async function initializeWorkflow() {
    await loadTemplates();
    await previewWorkflow();
}

ZOHO.embeddedApp.on("PageLoad", () => {
    initializeWorkflow().catch(error => {
        document.getElementById("status").textContent = error.message;
    });
});
async function saveWorkflow(){

    const variables={};

    document
    .querySelectorAll("#variablesContainer select")
    .forEach(select=>{

        variables[
            select.id.replace("map_","")
        ]=select.value;

    });

    const body={

        organizationId:
            await getOrganizationId(),

        workflowName:
            document
            .getElementById("workflowName")
            .value,

        module:
            document
            .getElementById("module")
            .value,

        trigger:
            document
            .getElementById("trigger")
            .value,

        channel:
            document
            .getElementById("channel")
            .value,

        templateId:
            document
            .getElementById("templateSelect")
            .value,

        templateName:
            document
            .getElementById("templateSelect")
            .selectedOptions[0].textContent,

        recipientField:
            document
            .getElementById("recipientField")
            .value,

        variables

    };

    try {
        const result = await requestJson(

            "/api/workflow/save",

            {

                method:"POST",

                headers:{

                    "Content-Type":"application/json"

                },

                body:JSON.stringify(body)

            }

        );

        const webhookUrl = `${window.location.origin}${getApiUrl(`/api/workflow/trigger/${result.workflowId}`)}`;
        document.getElementById("status").replaceChildren(
            "Workflow saved. Add this URL to the Zoho CRM workflow webhook: ",
            Object.assign(document.createElement("code"), { textContent: webhookUrl })
        );
    } catch (error) {
        document.getElementById("status").textContent = error.message;
    }

}
async function getModuleFields(moduleName) {

    const response = await ZOHO.CRM.META.getFields({

        Entity: moduleName

    });

    return response.fields || [];

}
async function renderMappings(body) {

    const container =
        document.getElementById("variablesContainer");

    container.innerHTML = "";

    const variables = getTemplateVariables(body);

    const module =
        document.getElementById("module").value;

    const fields =
        await getModuleFields(module);

    variables.forEach(variable => {

        const div =
            document.createElement("div");

        div.className = "mapping";

        const select =
            document.createElement("select");

        select.id = `map_${variable}`;

        fields.forEach(field => {

            const option =
                document.createElement("option");

            option.value = field.api_name;

            option.textContent =
                `${field.field_label} (${field.api_name})`;

            select.appendChild(option);

        });

        div.innerHTML =
            `<label>${variable}</label>`;

        div.appendChild(select);

        container.appendChild(div);

    });

}

document
.getElementById("module")
.addEventListener("change", () => {

    previewWorkflow();

});

document
.getElementById("channel")
.addEventListener("change", () => {
    loadTemplates()
        .then(previewWorkflow)
        .catch(error => { document.getElementById("status").textContent = error.message; });
});

document
.getElementById("templateSelect")
.addEventListener("change", previewWorkflow);

document
.getElementById("saveBtn")
.addEventListener("click", saveWorkflow);

ZOHO.embeddedApp.init();

