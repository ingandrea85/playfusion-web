/**
 * Auth0 post-login Action `pf-provision-org` — version-controlled source of truth.
 *
 * This file is deployed to the Auth0 tenant `dev-c6din8ya` via the Management API
 * (action id a0687aec-9001-4361-a4af-751acb7657d4), NOT by the CDK pipeline. Keep this
 * copy in sync when you change the deployed Action.
 *
 * Two-path onboarding (T5, #141):
 *   - Org-scoped login (an invited member accepting an Auth0 Organization invitation, or an
 *     explicit org login) → use THAT org, never create a personal one.
 *   - Returning owner → the personal org recorded on the user (app_metadata.org_id).
 *   - Invited member logging in without org context → reuse an org they already belong to.
 *   - Genuine sign-up (no org anywhere) → create the user's personal org; they are the OWNER
 *     (Auth0 role `tenant_admin`) and the org gets a DB connection enabled so it can invite.
 *
 * Roles are ALWAYS read from the real Auth0 assignments (org member roles + global user roles)
 * and injected as namespaced claims. Secrets: DOMAIN, CLIENT_ID, CLIENT_SECRET, NAMESPACE
 * (ORGANIZER_ROLE_ID is legacy/unused now that sign-up creates an OWNER).
 */
exports.onExecutePostLogin = async (event, api) => {
  const s = event.secrets;
  const OWNER_ROLE_ID = 'rol_xdGUCYHML2UISpkB'; // tenant_admin (OWNER)
  const CONNECTION_ID = 'con_LmuclRYAX5VuUMow'; // Username-Password-Authentication
  try {
    const { ManagementClient } = require('auth0');
    const mgmt = new ManagementClient({ domain: s.DOMAIN, clientId: s.CLIENT_ID, clientSecret: s.CLIENT_SECRET });
    const userId = event.user.user_id;

    // 1) Org-scoped login (invited member / explicit org login) → use that org, no creation.
    let orgId = event.organization && event.organization.id;
    // 2) Returning owner: the personal org recorded on the user.
    if (!orgId) orgId = event.user.app_metadata && event.user.app_metadata.org_id;
    // 3) Invited member logging in WITHOUT org context → reuse an org they already belong to.
    if (!orgId) {
      const orgs = await mgmt.users.getUserOrganizations({ id: userId }).then((r) => r.data || []).catch(() => []);
      if (orgs.length) orgId = orgs[0].id;
    }
    // 4) Genuine sign-up: create the user's personal org; they are the OWNER.
    if (!orgId) {
      const handle = 'u-' + String(userId).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 44);
      const { data: org } = await mgmt.organizations.create({ name: handle, display_name: event.user.name || event.user.email || handle });
      orgId = org.id;
      await mgmt.organizations.addEnabledConnection({ id: orgId }, { connection_id: CONNECTION_ID, assign_membership_on_login: false }).catch((e) => console.log('enable connection failed:', e && e.message));
      await mgmt.organizations.addMembers({ id: orgId }, { members: [userId] });
      await mgmt.organizations.addMemberRoles({ id: orgId, user_id: userId }, { roles: [OWNER_ROLE_ID] });
      await mgmt.users.update({ id: userId }, { app_metadata: { org_id: orgId } });
    }

    // Roles from the ACTUAL assignments (org member roles + global user roles), never a fixed list.
    const [orgRoles, userRoles] = await Promise.all([
      mgmt.organizations.getMemberRoles({ id: orgId, user_id: userId }).then((r) => r.data || []).catch(() => []),
      mgmt.users.getRoles({ id: userId }).then((r) => r.data || []).catch(() => []),
    ]);
    const roles = [...new Set([...orgRoles, ...userRoles].map((r) => r.name))];
    api.accessToken.setCustomClaim('org_id', orgId);
    api.idToken.setCustomClaim(`${s.NAMESPACE}/org_id`, orgId);
    api.accessToken.setCustomClaim(`${s.NAMESPACE}/roles`, roles);
    api.idToken.setCustomClaim(`${s.NAMESPACE}/roles`, roles);
  } catch (e) {
    console.log('org provisioning failed:', e && e.message);
  }
};
