import test from "node:test";
import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadSource } from "./permissions-loader.mjs";
import { scenarios } from "./permissions-scenarios.mjs";
const require = createRequire(import.meta.url);
if (process.env.FF_PERMISSIONS_DB_TEST !== "1") throw new Error("STOP: Set FF_PERMISSIONS_DB_TEST=1 to authorize isolated development fixtures.");
if (!process.loadEnvFile) throw new Error("Node with process.loadEnvFile is required.");
process.loadEnvFile(".env.development.local");
if (process.env.NODE_ENV !== "development") throw new Error("STOP: Development mode required.");
const {developmentConnection} = loadSource("src/server/database/development.ts");
const url = developmentConnection("FF_M3_DISPATCH_DATABASE_URL");
const {Pool} = require("pg");
const pool = new Pool({connectionString:url,max:4,connectionTimeoutMillis:5000,statement_timeout:15000});
pool.on("error", () => console.error("Development fixture connection failed; details withheld."));
const {PostgresTransactionRunner} = loadSource("src/server/database/postgres.ts");
const runner = new PostgresTransactionRunner(pool);
async function fixtureFactory() {
  const prefix = "ff_permissions_test_" + randomBytes(10).toString("hex");
  const dispatch = prefix + "_dispatch", auth = prefix + "_auth";
  function map(sql) {
    return sql.replaceAll("ff_organizer_dispatch.", `"${dispatch}".`).replaceAll("ff_organizer_auth.", `"${auth}".`);
  }
  const wrap = tx => ({query: (sql,args) => tx.query(map(sql),args)});
  const db = {executor:wrap(runner.executor),transaction:work => runner.transaction(tx => work(wrap(tx)))};
  async function close() {
    // Names are generated locally and must match before interpolation.
    if (!/^ff_permissions_test_[0-9a-f]{20}_dispatch$/.test(dispatch)) throw new Error("Unsafe fixture schema");
    await pool.query(`DROP SCHEMA IF EXISTS "${dispatch}" CASCADE; DROP SCHEMA IF EXISTS "${auth}" CASCADE;`);
  }
  try {
    await runner.transaction(async tx => {
      await tx.query(`CREATE SCHEMA "${dispatch}"; CREATE SCHEMA "${auth}"; SET LOCAL search_path TO "${dispatch}";`);
      for (const file of ["organizer-dispatch.sql","organizer-permissions.sql"]) {
        const sql = readFileSync("db/migrations/"+file,"utf8").replace(/^BEGIN;\s*$/gm,"").replace(/^COMMIT;\s*$/gm,"");
        await tx.query(map(sql));
      }
      await tx.query(`CREATE TABLE "${auth}"."user" (email text NOT NULL, "emailVerified" boolean NOT NULL)`);
    });
  } catch {await close(); throw new Error("Isolated fixture setup failed; database details withheld.");}
  return {db,
    async user(email,verified=true) {await pool.query(`INSERT INTO "${auth}"."user" VALUES ($1,$2)`,[email,verified]);},
    async member(slug,subject,role) {await pool.query(`INSERT INTO "${dispatch}".ff_campaign_organizer_members (campaign_slug,actor_subject,role,granted_by) VALUES ($1,$2,$3,$2)`,[slug,subject,role]);},
    async snapshot() {
      const m = await pool.query(`SELECT campaign_slug AS slug,actor_subject AS subject,role FROM "${dispatch}".ff_campaign_organizer_members ORDER BY campaign_slug,actor_subject`);
      const a = await pool.query(`SELECT campaign_slug AS slug,actor_subject AS actor,target_subject AS target,action,previous_role AS previous,new_role AS next FROM "${dispatch}".ff_campaign_membership_audit ORDER BY audit_id`);
      return {members:m.rows,audits:a.rows};
    },
    async breakAudit() {
      // Only the isolated test audit table gets this fault-injection constraint.
      await pool.query(`ALTER TABLE "${dispatch}".ff_campaign_membership_audit ADD CONSTRAINT synthetic_audit_failure CHECK (false)`);
    },close,
  };
}
try {
  await scenarios(test, fixtureFactory);
  await test("service actually waits for a held PostgreSQL campaign advisory lock", async () => {
    const f = await fixtureFactory();
    const {organizerSubject} = loadSource("src/lib/organizer-identity.ts");
    const {mutatePermission} = loadSource("src/server/organizer/permissions-store.ts");
    let blocker, attempt;
    try {
      const email = "lock-owner@example.invalid", actor = organizerSubject(email);
      await f.user(email); await f.user("lock-target@example.invalid");
      await f.member("campaign-a",actor,"owner");
      blocker = await pool.connect();
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock(72401, hashtext($1))",["campaign-a"]);
      let pid;
      const observed = {executor:f.db.executor,transaction:work => f.db.transaction(async tx => {
        pid = (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        return work(tx);
      })};
      attempt = mutatePermission(observed,"campaign-a",actor,{action:"grant",email:"lock-target@example.invalid",role:"editor"});
      // Attach a handler immediately even if the assertion or connection fails.
      attempt.catch(() => {});
      let waiting = false;
      const deadline = Date.now()+8000;
      while (Date.now()<deadline) {
        if (pid) {
          const locks = await pool.query("SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND classid=72401 AND NOT granted",[pid]);
          if (locks.rowCount === 1) {waiting = true; break;}
        }
        await delay(50);
      }
      assert.equal(waiting,true,"Expected the actual service transaction to wait on the held campaign lock.");
      await blocker.query("ROLLBACK"); blocker.release(); blocker = null;
      await attempt;
      assert.equal((await f.snapshot()).audits.length,1);
    } finally {
      if (blocker) {try {await blocker.query("ROLLBACK");} finally {blocker.release();}}
      if (attempt) await attempt.catch(() => {});
      await f.close();
    }
  });
}
finally {await pool.end();}
