async function getOrganizationId() {

    const response = await ZOHO.CRM.CONFIG.getOrgInfo();
    const organization = Array.isArray(response?.org) ? response.org[0] : response?.org;
    const organizationId = organization?.id || organization?.org_id || organization?.organization_id;

    if (!organizationId) {
        throw new Error("Unable to determine the Zoho organization ID.");
    }

    return String(organizationId);

}
