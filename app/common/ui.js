function setStatus(message, elementId = "sendStatus") {
    const element = document.getElementById(elementId);
    if (element) element.textContent = message;
}

function setLeadCount(count) {
    document.getElementById("leadCount").textContent = `Selected Leads : ${count}`;
}
