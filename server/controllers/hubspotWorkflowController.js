const messageService = require("../Services/messageService");

async function sendWorkflowMessage(req, res) {

    try {

        console.log(
            "HubSpot Workflow Payload:",
            JSON.stringify(req.body, null, 2)
        );

        const {
            inputFields = {},
            object = {},
            origin = {},
            context = {}
        } = req.body;


        const channel =
            inputFields.channel?.toLowerCase();

        const templateId =
            inputFields.template_id;

        const recipient =
            inputFields.recipient;

        if (!channel) {

            return res.status(400).json({

                success: false,

                message: "Channel is required."

            });

        }


        if (!templateId) {

            return res.status(400).json({

                success: false,

                message: "Template ID is required."

            });

        }


        if (!recipient) {

            return res.status(400).json({

                success: false,

                message: "Recipient is required."

            });

        }

        const portalId =
            origin.portalId;


        if (!portalId) {

            return res.status(400).json({

                success: false,

                message: "HubSpot portal ID not found."

            });

        }

        // const organizationId = `hubspot_${portalId}`;

        const organizationId = "demo_org";


        const recordId =
            object.objectId || null;

        const module =
            object.objectType || null;


        let variables =
            inputFields.variables || {};



        if (typeof variables === "string") {

            try {

                variables =
                    JSON.parse(variables);

            }
            catch (error) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Variables must contain valid JSON."

                });

            }

        }


        const result =
            await messageService.sendMessage({

                organizationId,

                channel,

                recipient,

                templateId,

                templateName:
                    inputFields.template_name ||
                    templateId,

                recordId,

                module,

                variables

            });


        return res.status(200).json({

            success: true,

            message:
                "Message submitted successfully.",

            portalId,

            recordId,

            channel,

            templateId,

            recipient,

            result: result.result

        });

    }
    catch (error) {

        console.error(
            "HubSpot Workflow Error:",
            error
        );


        return res.status(
            error.statusCode || 500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to send workflow message."

        });

    }

}


module.exports = {

    sendWorkflowMessage

};