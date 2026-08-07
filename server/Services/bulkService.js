const messageService =
require("./messageService");
async function send(data){

    const {

        organizationId,
        channel,
        templateId,
        templateName,
        variables,
        leads

    } = data;

   const results = [];

let success = 0;

let failed = 0;

for(const lead of leads){

    try{

        const recipient =
            channel === "email"
                ? lead.Email
                : (lead.Mobile || lead.Phone);

        const finalVariables = {};

Object.keys(variables).forEach(key=>{

    const field = variables[key];

    finalVariables[key] =
        lead[field] || "";

});

await messageService.sendMessage({

    organizationId,

    channel,

    recipient,

    templateId,

    templateName,

    variables:finalVariables,

    recordId:lead.id,

    module:"Leads"

});

        success++;

        results.push({

            id:lead.id,

            name:lead.Full_Name,

            status:"sent"

        });

    }

    catch(err){

        failed++;

        results.push({

            id:lead.id,

            name:lead.Full_Name,

            status:"failed",

            error:err.message

        });

    }

}
        


   return{

    success:true,

    total:leads.length,

    successCount:success,

    failedCount:failed,

    results

};

}

module.exports = {
    send
};