const bulkService =
require("../Services/bulkService");

exports.sendBulkMessages =
async (req,res)=>{

    try{

        const result =
        await bulkService.send(req.body);

        res.json(result);

    }

    catch(err){

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

};
