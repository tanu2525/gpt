function setStatus(message, elementId = "sendStatus") {
    const element = document.getElementById(elementId);
    if (element) element.textContent = message;
}

function setRecordCount(count, moduleName = "Leads") {
    const element = document.getElementById("leadCount") || document.getElementById("recordCount");
    if (element) element.textContent = `Selected ${moduleName}: ${count}`;
}

function setLeadCount(count) {
    setRecordCount(count, "Leads");
}
