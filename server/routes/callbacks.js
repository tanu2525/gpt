const express = require("express");
const router = express.Router();

const DeliveryLog =
require("../models/DeliveryLog");

router.post("/", async (req,res)=>{

    try{

        const body=req.body;

        console.log("Callback Received");

        console.log(body);

        const providerId=
            body.logid ||
            body.LogID ||
            body.message_id;

        const status=
            body.status ||
            body.Status;

        const mobile=
            body.mobile ||
            body.Mobile;

        const email=
            body.email;

        const updated =
        await DeliveryLog.findOneAndUpdate(

            {
                $or:[
                    {
                        providerMessageId:providerId
                    },
                    {
                        recipient:mobile
                    },
                    {
                        recipient:email
                    }
                ]
            },

            {

                status:status,

                payload:body

            },

            {
                new:true
            }

        );

        console.log(updated);

        res.json({

            success:true

        });

    }

    catch(err){

        console.log(err);

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

});

module.exports=router;