/* =============================================================================
 * Google Contacts operations (F4.2, People API). Provider-neutral in/out. Read-only.
 * ========================================================================== */

import type { ConnectorResult, OperationOutput } from "@brightloop/domain";
import { callGoogle, type GoogleAdapterConfig } from "./client.js";
import { arr, obj, optNum, optStr, output, reqStr, type OpInput } from "./helpers.js";

const BASE = "https://people.googleapis.com/v1";
const PERSON_FIELDS = "names,emailAddresses,organizations";

function normPerson(p: Record<string, unknown>): Record<string, unknown> {
  const name = obj(arr(p["names"])[0]);
  const email = obj(arr(p["emailAddresses"])[0]);
  const org = obj(arr(p["organizations"])[0]);
  return {
    resourceName: optStr(p, "resourceName"),
    displayName: optStr(name, "displayName"),
    email: optStr(email, "value"),
    organization: optStr(org, "name"),
    title: optStr(org, "title"),
  };
}

export type ContactsHandler = (cfg: GoogleAdapterConfig, token: string | null, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>;

export const CONTACTS_OPS: Record<string, ContactsHandler> = {
  "contacts.list": async (cfg, t, input) => {
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/people/me/connections`, query: { personFields: PERSON_FIELDS, pageSize: optNum(input, "pageSize", 50) } });
    if (!res.ok) return res;
    return output({ contacts: arr(res.value["connections"]).map(normPerson), nextPageToken: optStr(res.value, "nextPageToken") });
  },
  "contacts.search": async (cfg, t, input) => {
    const q = reqStr(input, "query"); if (!q.ok) return q;
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/people:searchContacts`, query: { query: q.value, readMask: PERSON_FIELDS, pageSize: optNum(input, "pageSize", 25) } });
    if (!res.ok) return res;
    return output({ contacts: arr(res.value["results"]).map((r) => normPerson(obj(r["person"]))) });
  },
  "contacts.get": async (cfg, t, input) => {
    const rn = reqStr(input, "resourceName"); if (!rn.ok) return rn;
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/${rn.value}`, query: { personFields: PERSON_FIELDS } });
    if (!res.ok) return res;
    return output({ contact: normPerson(res.value) });
  },
  "contacts.organizations": async (cfg, t, input) => {
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/people/me/connections`, query: { personFields: "names,organizations", pageSize: optNum(input, "pageSize", 50) } });
    if (!res.ok) return res;
    const organizations = arr(res.value["connections"])
      .map((p) => ({ resourceName: optStr(p, "resourceName"), organization: optStr(obj(arr(p["organizations"])[0]), "name"), title: optStr(obj(arr(p["organizations"])[0]), "title") }))
      .filter((o) => o.organization.length > 0);
    return output({ organizations });
  },
};
