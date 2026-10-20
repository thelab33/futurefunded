import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./permissions-loader.mjs";
const {organizerSubject} = loadSource("src/lib/organizer-identity.ts");
function principalReader() {
  let session = {user:{email:"owner@example.invalid",emailVerified:true}};
  let role = "owner", configured = true;
  const queries = [];
  const {requireOrganizerPrincipal} = loadSource("src/server/organizer/studio-session.ts", {
    "next/headers": {headers:async () => new Headers()},
    "@/lib/organizer-auth": {
      organizerSubject,organizerAuthConfigured:() => configured,
      getOrganizerAuth:() => ({api:{getSession:async () => session}}),
    },
    "@/server/organizer/dispatch-database": {getOrganizerDispatchDatabase:() => ({executor:{query:async (_sql,args) => {
      queries.push(args);
      return {rows:role ? [{role}] : [],rowCount:role ? 1 : 0};
    }}})},
  });
  return {read:requireOrganizerPrincipal,queries,setSession(value){session=value;},setRole(value){role=value;},disable(){configured=false;}};
}
await test("revoked authentication returns no principal", async () => {
  const f=principalReader();f.setSession(null);assert.equal(await f.read("campaign-a"),null);assert.equal(f.queries.length,0);
});
await test("unverified account returns no principal", async () => {
  const f=principalReader();f.setSession({user:{email:"owner@example.invalid",emailVerified:false}});
  assert.equal(await f.read("campaign-a"),null);assert.equal(f.queries.length,0);
});
await test("membership removal denies subsequent principal lookup", async () => {
  const f=principalReader();assert.equal((await f.read("campaign-a")).role,"owner");
  f.setRole(null);assert.equal(await f.read("campaign-a"),null);
});
await test("role change is read on the next request with exact campaign scope", async () => {
  const f=principalReader();await f.read("campaign-a");f.setRole("editor");
  assert.equal((await f.read("campaign-b")).role,"editor");
  assert.deepEqual(f.queries.map(args => args[0]),["campaign-a","campaign-b"]);
  assert.ok(f.queries.every(args => args[1] === organizerSubject("owner@example.invalid")));
});
await test("disabled configuration and invalid campaign fail before membership lookup", async () => {
  const f=principalReader();assert.equal(await f.read("../campaign-a"),null);f.disable();
  assert.equal(await f.read("campaign-a"),null);assert.equal(f.queries.length,0);
});
