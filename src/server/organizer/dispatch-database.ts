import "server-only";
import { Pool } from "pg";
import { PostgresTransactionRunner } from "@/server/database/postgres";
import { developmentConnection } from "@/server/database/development";
const globalPool = globalThis as typeof globalThis & { ffDevDispatchPool?: Pool };
export function getOrganizerDispatchDatabase(): PostgresTransactionRunner {
  const url = developmentConnection("FF_M3_DISPATCH_DATABASE_URL");
  if (!globalPool.ffDevDispatchPool) {
    const pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 10000, options: "-c search_path=ff_organizer_dispatch" });
    pool.on("error", () => console.error("Organizer dispatch pool connection failed."));
    globalPool.ffDevDispatchPool = pool;
  }
  return new PostgresTransactionRunner(globalPool.ffDevDispatchPool);
}
