import { Pool, type PoolClient } from "pg";
import type { SqlExecutor, SqlTransactionRunner } from "./sql-client";

function wrap(client: Pick<PoolClient, "query">): SqlExecutor {
  return {
    async query<Row extends Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
      const result = await client.query<Row>(sql, params ? [...params] : []);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

/** Shared transaction adapter. No connections are made during module evaluation. */
export class PostgresTransactionRunner implements SqlTransactionRunner {
  readonly executor: SqlExecutor;
  constructor(private readonly pool: Pool) { this.executor = wrap(pool); }
  async transaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const result = await work(wrap(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Retain original failure. */ }
      throw error;
    } finally { client.release(); }
  }
}
