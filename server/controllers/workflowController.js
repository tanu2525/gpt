const workflowService =
require("../Services/workflowService");

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