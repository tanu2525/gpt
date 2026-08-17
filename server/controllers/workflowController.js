const workflowService =
require("../Services/workflowService");
const WorkflowConfig = require("../models/WorkflowConfig");

exports.saveWorkflow = async (req, res) => {
    try {
        const required = ["organizationId", "workflowName", "module", "trigger", "channel", "templateId", "recipientField"];
        const missing = required.find(field => !req.body[field]);
        if (missing) return res.status(400).json({ success: false, message: `${missing} is required.` });

        const workflow = await WorkflowConfig.findOneAndUpdate(
            { organizationId: String(req.body.organizationId), workflowName: req.body.workflowName },
            { ...req.body, organizationId: String(req.body.organizationId), enabled: true },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

        res.status(201).json({ success: true, workflowId: workflow._id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.triggerWorkflow = async (req, res) => {
    try {
        const result = await workflowService.trigger(req.params.workflowId, req.body);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

exports.sendWorkflowMessage =
async (req, res) => {

    try {

        const result =
        await workflowService.send(req.body);

        res.json(result);

    }

    catch(err){

        console.error(err);

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

};
