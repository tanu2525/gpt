const zohoAuthkeyBulkService = require("../Services/zohoAuthkeyBulkService");
const AuthkeySyncHistory = require("../models/AuthkeySyncHistory");

function createHistoryPayload(organizationId, module, result) {
    return {
        organizationId,
        module,
        listName: result.listName,
        mappings: result.mappings,
        total: result.total,
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
        status: result.success
            ? "success"
            : result.sent > 0 ? "partial" : "failed",
        failures: result.failures.slice(0, 100).map(item => ({
            recordId: item.recordId ? String(item.recordId) : "",
            reason: String(item.reason || "Unknown error"),
            type: String(item.type || "failed")
        }))
    };
}

async function syncModule(req, res) {
    try {
        const {
            organizationId,
            module,
            listName,
            mappings = []
        } = req.body;

        const result = await zohoAuthkeyBulkService.syncModule({
            organizationId,
            module,
            listName,
            mappings
        });

        let historyId = null;

        try {
            const history = await AuthkeySyncHistory.create(
                createHistoryPayload(organizationId, module, result)
            );
            historyId = history._id;
        } catch (historyError) {
            console.error("Unable to save Authkey sync history:", historyError.message);
        }

        return res.status(result.success ? 200 : 207).json({
            success: result.success,
            module: result.module,
            listName: result.listName,
            total: result.total,
            sent: result.sent,
            skipped: result.skipped,
            failed: result.failed,
            failures: result.failures.slice(0, 20).map(item => ({
                recordId: item.recordId,
                reason: item.reason,
                type: item.type
            })),
            historyId
        });
    } catch (error) {
        console.error(
            "Zoho to Authkey bulk sync error:",
            error.response?.data || error.message
        );

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Unable to send CRM records to Authkey."
        });
    }
}

async function getSyncHistory(req, res) {
    try {
        const { organizationId } = req.params;

        const history = await AuthkeySyncHistory
            .find({ organizationId })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        return res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error("Authkey sync history error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load Authkey sync history."
        });
    }
}

module.exports = {
    syncModule,
    getSyncHistory
};
