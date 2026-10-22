import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./permissions-loader.mjs";
const routeFile = "src/app/api/organizer/[slug]/members/manage/route.ts";
function route({principal = null, authFailure = false, mutationFailure = false} = {}) {
  let writes = 0;
  const stubs = {
    "@/lib/organizer-auth": {organizerAuthConfigured: () => true},
    "@/server/organizer/studio-session": {async requireOrganizerPrincipal() {if (authFailure) throw new Error("secret sentinel"); return principal;}},
    "@/server/organizer/dispatch-database": {getOrganizerDispatchDatabase() {return {}; }},
    "next/server": {NextResponse: {json: (value,init) => Response.json(value,init)}},
    "@/server/organizer/permissions-store": {PermissionError: class extends Error {}, async mutatePermission() {writes++; if(mutationFailure) throw new Error("secret sentinel"); return {action:"grant",role:"editor"};}},
  };
  const {POST} = loadSource(routeFile,stubs);
  return {POST,get writes(){return writes;}};
}
const owner = {role:"owner",actor:{subject:"emailsha256:"+"a".repeat(64)}};
function request(body={action:"grant",email:"target@example.invalid",role:"editor"}, origin="http://127.0.0.1:3355") {
  return new Request("http://127.0.0.1:3355/api/organizer/campaign-a/members/manage", {method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify(body)});
}
const context = {params:Promise.resolve({slug:"campaign-a"})};
const old = {NODE_ENV:process.env.NODE_ENV,FF_DEVELOPMENT_STUDIO:process.env.FF_DEVELOPMENT_STUDIO,BETTER_AUTH_URL:process.env.BETTER_AUTH_URL};
process.env.NODE_ENV="development"; process.env.FF_DEVELOPMENT_STUDIO="1"; process.env.BETTER_AUTH_URL="http://127.0.0.1:3355";
try {
  await test("anonymous, editor and publisher cannot mutate", async () => {
    for (const principal of [null,{...owner,role:"editor"},{...owner,role:"publisher"}]) {
      const r=route({principal});assert.equal((await r.POST(request(),context)).status,403);assert.equal(r.writes,0);
    }
  });
  await test("production and disabled development reject before mutation", async () => {
    for (const [mode,gate] of [["production","1"],["development","0"]]) {
      process.env.NODE_ENV=mode;process.env.FF_DEVELOPMENT_STUDIO=gate;
      const r=route({principal:owner});assert.equal((await r.POST(request(),context)).status,503);assert.equal(r.writes,0);
    }
    process.env.NODE_ENV="development";process.env.FF_DEVELOPMENT_STUDIO="1";
  });
  await test("owner same-origin request reaches one writer", async () => {
    const r=route({principal:owner});const response=await r.POST(request(),context);
    assert.equal(response.status,200);assert.equal(r.writes,1);assert.equal(response.headers.get("cache-control"),"private, no-store");
  });
  await test("cross-origin request blocked", async () => {
    const r=route({principal:owner});assert.equal((await r.POST(request(undefined,"https://attacker.invalid"),context)).status,400);assert.equal(r.writes,0);
  });
  await test("extra keys, invalid roles, remove with role rejected", async () => {
    for (const body of [{action:"grant",email:"x@example.invalid",role:"admin"},{action:"remove",email:"x@example.invalid",role:"editor"},{action:"grant",email:"x@example.invalid",role:"editor",actor:"forged"}]) {
      const r=route({principal:owner});assert.equal((await r.POST(request(body),context)).status,422);assert.equal(r.writes,0);
    }
  });
  await test("authentication and mutation failures return sanitized JSON", async () => {
    for (const opts of [{authFailure:true},{principal:owner,mutationFailure:true}]) {
      const r=route(opts);const response=await r.POST(request(),context);
      assert.equal(response.status,503);assert.ok(!(await response.text()).includes("secret sentinel"));
    }
  });
} finally {
  for (const [key,value] of Object.entries(old)) {if(value===undefined) delete process.env[key]; else process.env[key]=value;}
}
