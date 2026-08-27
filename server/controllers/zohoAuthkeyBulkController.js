const zohoAuthkeyBulkService = require("../Services/zohoAuthkeyBulkService");

async function syncModule(req, res) {
    try {
        const { organizationId, module } = req.body;

        const result = await zohoAuthkeyBulkService.syncModule({
            organizationId,
            module
        });

        return res.status(result.success ? 200 : 207).json(result);
    } catch (error) {
        console.error(
            "Zoho to Authkey bulk sync error:",
            error.response?.data || error.message
        );

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message
        });
    }
}

module.exports = {
    syncModule
};
