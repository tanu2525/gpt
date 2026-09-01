function normalizeTemplate(template, channel) {
    const selectedChannel = String(channel || "").toLowerCase();

    let templateId;

    if (selectedChannel === "rcs") {
        templateId =
            template.template_id ||
            template.templateId ||
            template.name ||
            template.template_name ||
            template.temp_name ||
            template.id;
    } else {
        templateId =
            template.wid ||
            template.sid ||
            template.mid ||
            template.vid ||
            template.template_id ||
            template.templateId ||
            template.id;
    }

    return {
        id: templateId,

        name:
            template.temp_name ||
            template.template_name ||
            template.subject ||
            template.name ||
            template.title ||
            templateId,

        body:
            template.temp_body ||
            template.template_body ||
            template.email_body ||
            template.html ||
            template.body ||
            template.content ||
            template.message ||
            ""
    };
}


async function loadTemplates({
    selectId = "templateSelect",
    channel
} = {}) {

    const selectedChannel =
        channel ||
        document.getElementById("channel").value;

    const data = await getChannelTemplates(selectedChannel);

    console.log(
        "Templates received from server:",
        selectedChannel,
        data
    );

    let sourceTemplates = [];
    if (Array.isArray(data)) {
        sourceTemplates = data;

    } else if (Array.isArray(data.data)) {
        sourceTemplates = data.data;

    } else if (Array.isArray(data.templates)) {
        sourceTemplates = data.templates;

    } else if (Array.isArray(data.result)) {
        sourceTemplates = data.result;

    } else if (Array.isArray(data.response)) {
        sourceTemplates = data.response;
    }

    const templates = sourceTemplates
        .map(template =>
            normalizeTemplate(template, selectedChannel)
        )
        .filter(template => template.id);

    console.log(
        "Normalized templates:",
        selectedChannel,
        templates
    );

    const select = document.getElementById(selectId);

    select.replaceChildren();

    templates.forEach(template => {

        const option = document.createElement("option");

        option.value = template.id;
        option.textContent =
            template.name ||
            `Template ${template.id}`;

        option.dataset.body = template.body;

        select.appendChild(option);
    });

    if (!templates.length) {
        throw new Error(
            `No ${selectedChannel} templates found.`
        );
    }

    return templates;
}
