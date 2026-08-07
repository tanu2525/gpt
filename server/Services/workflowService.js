const axios = require("axios");

const messageService =
require("./messageService");

async function fetchLead(
    recordId,
    module,
    accessToken
){

    const response =
    await axios.get(

        `https://www.zohoapis.com/crm/v7/${module}/${recordId}`,

        {

            headers:{

                Authorization:
                `Zoho-oauthtoken ${accessToken}`

            }

        }

    );

    return response.data.data[0];

}

exports.send =
async function(data){

    const {

        organizationId,
        accessToken,
        recordId,
        module,
        channel,
        templateId,
        templateName,
        variables

    } = data;

    const record =
    await fetchLead(

        recordId,
        module,
        accessToken

    );

    const recipient =
    channel==="email"

        ? record.Email

        : (
            record.Mobile
            ||
            record.Phone
        );

    return await messageService.sendMessage({

        organizationId,

        channel,

        recipient,

        templateId,

        templateName,

        recordId,

        module,

        variables

    });

};