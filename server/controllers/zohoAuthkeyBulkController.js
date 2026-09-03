const zohoAuthkeyBulkService = require("../Services/zohoAuthkeyBulkService");
const AuthkeySyncHistory = require("../models/AuthkeySyncHistory");
const AuthkeySyncRecord = require("../models/AuthkeySyncRecord");

async function syncModule(req, res) {
    try {
        const { organizationId, module, mappings = [] } = req.body;
        const result = await zohoAuthkeyBulkService.syncModule({
            organizationId,
            module,
            mappings
        });

        const history = await AuthkeySyncHistory.create({
            organizationId,
            module,
            mappings: result.mappings,
            total: result.total,
            sent: result.sent,
            skipped: result.skipped,
            failed: result.failed,
            status: result.success
                ? "success"
                : result.sent > 0 ? "partial" : "failed",
            failures: result.failures.slice(0, 100).map(item => ({
                recordId: item.recordId,
                reason: item.reason || item.error || "Unknown error",
                type: item.type
            }))
        });

        if (result.records.length) {
            await AuthkeySyncRecord.insertMany(
                result.records.map(item => ({
                    historyId: history._id,
                    organizationId,
                    module,
                    recordId: item.recordId,
                    status: item.type,
                    data: item.data || {},
                    reason: item.reason || item.error || ""
                }))
            );
        }

        const { records, ...responseResult } = result;
        return res.status(result.success ? 200 : 207).json({
            ...responseResult,
            historyId: history._id
        });
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

async function getSyncHistory(req, res) {
    try {
        const { organizationId } = req.params;
        const history = await AuthkeySyncHistory
            .find({ organizationId })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        return res.json({ success: true, data: history });
    } catch (error) {
        console.error("Authkey sync history error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to load Authkey sync history."
        });
    }
}

async function getSyncHistoryDetails(req, res) {
    try {
        const history = await AuthkeySyncHistory.findById(req.params.historyId).lean();
        if (!history || history.organizationId !== req.params.organizationId) {
            return res.status(404).json({
                success: false,
                message: "Sync history was not found."
            });
        }

        const records = await AuthkeySyncRecord
            .find({ historyId: history._id, organizationId: req.params.organizationId })
            .sort({ createdAt: -1 })
            .lean();

        return res.json({ success: true, history, records });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Unable to load sync details."
        });
    }
}

module.exports = {
    syncModule,
    getSyncHistory,
    getSyncHistoryDetails
};
