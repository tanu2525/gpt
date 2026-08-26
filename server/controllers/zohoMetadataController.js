const zohoCrmService = require("../Services/zohoCrmService");

async function getModules(req, res) {
    try {
        const accessToken =
            req.headers.authorization?.replace(
                "Bearer ",
                ""
            );

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "Zoho OAuth token is required"
            });
        }

        const result =
            await zohoCrmService.getModules(accessToken);

        return res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error(
            "Zoho modules error:",
            error.response?.data || error.message
        );

        return res.status(
            error.response?.status || 500
        ).json({
            success: false,
            message:
                error.response?.data?.message ||
                error.message
        });
    }
}

async function getWorkflowConfiguration(req, res) {
    try {
        const accessToken =
            req.headers.authorization?.replace(
                "Bearer ",
                ""
            );

        const { moduleApiName } = req.params;

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "Zoho OAuth token is required"
            });
        }

        if (!moduleApiName) {
            return res.status(400).json({
                success: false,
                message: "Module API name is required"
            });
        }

        const result =
            await zohoCrmService.getWorkflowConfiguration(
                accessToken,
                moduleApiName
            );

        return res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error(
            "Zoho workflow configuration error:",
            error.response?.data || error.message
        );

        return res.status(
            error.response?.status || 500
        ).json({
            success: false,
            message:
                error.response?.data?.message ||
                error.message
        });
    }
}

module.exports = {
    getModules,
    getWorkflowConfiguration
};