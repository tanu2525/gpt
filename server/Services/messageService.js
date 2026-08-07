const authkeyService = require("./authkeyService");
const DeliveryLog = require("../models/DeliveryLog");

async function sendMessage({

    organizationId,
    channel,
    recipient,
    templateId,
    templateName,
    recordId,
    module,
    variables

}){

    const result =
        await authkeyService.sendMessage({

            organizationId,
            channel,
            recipient,
            templateId,
            variables

        });

    const log =
        await DeliveryLog.create({

            organizationId,
            channel,
            recipient,
            templateId,
            templateName,
            recordId,
            module,

            status:"sent",

            providerMessageId:

                result.LogID ||
                result.logid ||
                result.message_id ||
                result.id ||
                null,

            payload:result

        });

    return{

        result,
        log

    };

}

module.exports={

    sendMessage

};