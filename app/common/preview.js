function previewTemplate({ selectId = "templateSelect", previewId = "preview", renderVariables } = {}) {
    const option = document.getElementById(selectId).selectedOptions[0];
    const body = option?.dataset.body || "";
    document.getElementById(previewId).value = body;
    if (renderVariables) renderVariables(body);
}
function previewWorkflow(){

    const option =
        document
        .getElementById("templateSelect")
        .selectedOptions[0];

    const body =
        option.dataset.body || "";

    renderMappings(body);

}