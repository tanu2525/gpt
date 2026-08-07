function normalizeTemplate(template) {
    return {
        id: template.wid || template.sid || template.mid || template.vid || template.template_id || template.templateId || template.id,
        name: template.temp_name || template.template_name || template.subject || template.name || template.title,
        body: template.temp_body || template.template_body || template.email_body || template.html || template.body || template.content || template.message || ""
    };
}

async function loadTemplates({ selectId = "templateSelect", channel } = {}) {
    const selectedChannel = channel || document.getElementById("channel").value;
    const data = await getChannelTemplates(selectedChannel);
    const sourceTemplates = Array.isArray(data.data) ? data.data : (Array.isArray(data.templates) ? data.templates : []);
    const templates = sourceTemplates.map(normalizeTemplate).filter(template => template.id);
    const select = document.getElementById(selectId);

    select.replaceChildren();
    templates.forEach(template => {
        const option = document.createElement("option");
        option.value = template.id;
        option.textContent = template.name || `Template ${template.id}`;
        option.dataset.body = template.body;
        select.appendChild(option);
    });

    if (!templates.length) {
        throw new Error(`No ${selectedChannel} templates found.`);
    }

    return templates;
}

