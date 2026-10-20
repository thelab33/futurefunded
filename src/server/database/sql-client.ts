export type SqlQueryResult<Row> = Readonly<{
  rows: readonly Row[];
  rowCount: number;
}>;

export interface SqlExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

/**
 * H3 intentionally depends on this tiny transaction port, not a specific npm
 * database client. H4 may bind it to pg/another production PostgreSQL driver.
 */
export interface SqlTransactionRunner {
  transaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T>;
  executor: SqlExecutor;
}
