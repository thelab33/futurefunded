import assert from "node:assert/strict";
import { loadSource } from "./permissions-loader.mjs";
const {mutatePermission} = loadSource("src/server/organizer/permissions-store.ts");
const {organizerSubject} = loadSource("src/lib/organizer-identity.ts");
const emails = {a: "owner-a@example.invalid", b: "owner-b@example.invalid", e: "editor@example.invalid", p: "publisher@example.invalid", t: "target@example.invalid"};
const ids = Object.fromEntries(Object.entries(emails).map(([key,email]) => [key,organizerSubject(email)]));
export async function scenarios(test, fixtureFactory) {
  async function fixture() {
    const f = await fixtureFactory();
    try {
    for (const email of Object.values(emails)) await f.user(email);
    await f.member("campaign-a", ids.a, "owner");
    await f.member("campaign-a", ids.e, "editor");
    await f.member("campaign-a", ids.p, "publisher");
    await f.member("campaign-b", ids.b, "owner");
    return f;
    } catch (error) {await f.close(); throw error;}
  }
  const cases = [
    ["grant, change role, remove, and exact audit transitions", async f => {
      await mutatePermission(f.db,"campaign-a",ids.a,{action:"grant",email:emails.t,role:"editor"});
      await mutatePermission(f.db,"campaign-a",ids.a,{action:"change_role",email:emails.t,role:"publisher"});
      await mutatePermission(f.db,"campaign-a",ids.a,{action:"remove",email:emails.t});
      const s = await f.snapshot();
      assert.equal(s.members.some(m => m.subject === ids.t),false);
      assert.deepEqual(s.audits.map(a => [a.action,a.previous,a.next]), [["grant",null,"editor"],["change_role","editor","publisher"],["remove","publisher",null]]);
      assert.ok(s.audits.every(a => a.slug === "campaign-a" && a.actor === ids.a && a.target === ids.t));
    }],
    ["editor and publisher denied without writes", async f => {
      const before = await f.snapshot();
      for (const actor of [ids.e,ids.p]) await assert.rejects(mutatePermission(f.db,"campaign-a",actor,{action:"grant",email:emails.t,role:"owner"}), {status:403});
      assert.deepEqual(await f.snapshot(), before);
    }],
    ["cross-campaign owner denied", async f => {
      const before = await f.snapshot();
      await assert.rejects(mutatePermission(f.db,"campaign-b",ids.a,{action:"grant",email:emails.t,role:"editor"}), {status:403});
      assert.deepEqual(await f.snapshot(),before);
    }],
    ["duplicate grant and same-role conflicts leave no audit", async f => {
      const before = await f.snapshot();
      await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action:"grant",email:emails.e,role:"owner"}), {status:409});
      await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action:"change_role",email:emails.e,role:"editor"}), {status:409});
      assert.deepEqual(await f.snapshot(),before);
    }],
    ["unknown and unverified account denied", async f => {
      await f.user("unverified@example.invalid",false);
      const before = await f.snapshot();
      for (const email of ["missing@example.invalid","unverified@example.invalid"]) await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action:"grant",email,role:"editor"}), {status:422});
      assert.deepEqual(await f.snapshot(),before);
    }],
    ["ambiguous verified identity denied", async f => {
      await f.user("TARGET@example.invalid");
      const before = await f.snapshot();
      await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action:"grant",email:emails.t,role:"editor"}), {status:422});
      assert.deepEqual(await f.snapshot(),before);
    }],
    ["final owner removal and demotion denied", async f => {
      const before = await f.snapshot();
      for (const action of ["remove","change_role"]) await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action,email:emails.a,...(action === "change_role" ? {role:"editor"} : {})}), {status:409});
      assert.deepEqual(await f.snapshot(),before);
    }],
    ["self-demotion with another owner succeeds, next write denied", async f => {
      await f.member("campaign-a",ids.b,"owner");
      await mutatePermission(f.db,"campaign-a",ids.a,{action:"change_role",email:emails.a,role:"editor"});
      const before = await f.snapshot();
      await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action:"grant",email:emails.t,role:"editor"}), {status:403});
      assert.deepEqual(await f.snapshot(),before);
    }],
    ["removed actor loses mutation authority", async f => {
      await f.member("campaign-a",ids.b,"owner");
      await mutatePermission(f.db,"campaign-a",ids.a,{action:"remove",email:emails.b});
      await assert.rejects(mutatePermission(f.db,"campaign-a",ids.b,{action:"grant",email:emails.t,role:"editor"}), {status:403});
    }],
    ["audit insert failure rolls membership back", async f => {
      const before = await f.snapshot();
      await f.breakAudit();
      await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action:"grant",email:emails.t,role:"owner"}));
      assert.deepEqual(await f.snapshot(),before);
    }],
    ["simultaneous owner demotions preserve one owner", async f => {
      await f.member("campaign-a",ids.b,"owner");
      const results = await Promise.allSettled([
        mutatePermission(f.db,"campaign-a",ids.a,{action:"change_role",email:emails.a,role:"editor"}),
        mutatePermission(f.db,"campaign-a",ids.b,{action:"change_role",email:emails.b,role:"editor"}),
      ]);
      assert.equal(results.filter(r => r.status === "fulfilled").length,1);
      assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 409).length,1);
      const s = await f.snapshot();
      assert.equal(s.members.filter(m => m.slug === "campaign-a" && m.role === "owner").length,1);
      assert.equal(s.audits.length,1);
    }],
    ["simultaneous duplicate grants commit one audit", async f => {
      const request = () => mutatePermission(f.db,"campaign-a",ids.a,{action:"grant",email:emails.t,role:"editor"});
      const results = await Promise.allSettled([request(),request()]);
      assert.equal(results.filter(r => r.status === "fulfilled").length,1);
      assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 409).length,1);
      assert.equal((await f.snapshot()).audits.length,1);
    }],
    ["simultaneous cross-demotions recheck actor authority under lock", async f => {
      await f.member("campaign-a",ids.b,"owner");
      const results = await Promise.allSettled([
        mutatePermission(f.db,"campaign-a",ids.a,{action:"change_role",email:emails.b,role:"editor"}),
        mutatePermission(f.db,"campaign-a",ids.b,{action:"change_role",email:emails.a,role:"editor"}),
      ]);
      assert.equal(results.filter(r => r.status === "fulfilled").length,1);
      assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 403).length,1);
      assert.equal((await f.snapshot()).audits.length,1);
    }],
    ["role-change audit failure rolls membership back", async f => {
      const before = await f.snapshot(); await f.breakAudit();
      await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action:"change_role",email:emails.e,role:"publisher"}));
      assert.deepEqual(await f.snapshot(),before);
    }],
    ["removal audit failure rolls membership back", async f => {
      const before = await f.snapshot(); await f.breakAudit();
      await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action:"remove",email:emails.e}));
      assert.deepEqual(await f.snapshot(),before);
    }],
    ["trimmed mixed-case email resolves to existing identity", async f => {
      await mutatePermission(f.db,"campaign-a",ids.a,{action:"grant",email:"  TARGET@EXAMPLE.INVALID  ",role:"editor"});
      assert.ok((await f.snapshot()).members.some(m => m.subject === ids.t));
    }],
    ["missing membership returns not found", async f => {
      const before = await f.snapshot();
      await assert.rejects(mutatePermission(f.db,"campaign-a",ids.a,{action:"remove",email:emails.t}), {status:404});
      assert.deepEqual(await f.snapshot(),before);
    }],
  ];
  for (const [name,run] of cases) await test(name,async () => {const f = await fixture();try {await run(f);} finally {await f.close();}});
}
