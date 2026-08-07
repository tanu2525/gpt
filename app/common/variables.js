function getTemplateVariables(body = "") {
    const curlyVariables = [...body.matchAll(/{{(.*?)}}/g)].map(match => match[1].trim());
    const hashVariables = [...body.matchAll(/{#(.*?)#}/g)].map(match => match[1].trim());
    return [...new Set([...curlyVariables, ...hashVariables].filter(Boolean))];
}

function renderTextVariableInputs(body, containerId = "variablesContainer") {
    const container = document.getElementById(containerId);
    container.replaceChildren();

    getTemplateVariables(body).forEach(variable => {
        const label = document.createElement("label");
        label.textContent = variable;
        const input = document.createElement("input");
        input.type = "text";
        input.name = variable;
        input.placeholder = `Enter ${variable}`;
        input.style.width = "100%";
        input.style.marginBottom = "12px";
        container.append(label, document.createElement("br"), input, document.createElement("br"));
    });
}

function renderFieldVariableSelectors(body, fields, containerId = "variablesContainer") {
    const container = document.getElementById(containerId);
    container.replaceChildren();

    getTemplateVariables(body).forEach(variable => {
        const wrapper = document.createElement("div");
        wrapper.className = "variable-row";
        const label = document.createElement("label");
        label.textContent = `Variable ${variable}`;
        const select = document.createElement("select");
        select.name = variable;

        fields.forEach(field => {
            const option = document.createElement("option");
            option.value = field.api_name;
            option.textContent = field.field_label;
            select.appendChild(option);
        });

        wrapper.append(label, select);
        container.appendChild(wrapper);
    });
}

function collectTemplateVariables(containerId = "variablesContainer") {
    return Object.fromEntries([...document.querySelectorAll(`#${containerId} input, #${containerId} select`)].map(field => [field.name, field.value]));
}

function normalizeSmsVariables(variables) {
    return Object.fromEntries(Object.values(variables).map((value, index) => [`var${index + 1}`, value]));
}
