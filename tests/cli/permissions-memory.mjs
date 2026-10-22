/** Deliberately small transaction model. Not evidence of PostgreSQL lock behavior. */
export function memoryFixture() {
  let state = {members: [], users: [], audits: []};
  let tail = Promise.resolve();
  let failAudit = false;
  const calls = [];
  async function execute(s, sql, args = []) {
    calls.push(sql);
    const q = sql.replace(/\s+/g, " ").trim();
    let rows = [], rowCount = 0;
    if (q.includes("pg_advisory_xact_lock")) return {rows, rowCount};
    if (q.includes('FROM ff_organizer_auth."user"')) {
      rows = s.users.filter(u => u.verified && u.email.toLowerCase() === args[0].toLowerCase()).slice(0, 2).map(u => ({email: u.email}));
    } else if (q.startsWith("SELECT count(*)")) {
      rows = [{total: String(s.members.filter(m => m.slug === args[0] && m.role === "owner").length)}];
    } else if (q.startsWith("SELECT role")) {
      rows = s.members.filter(m => m.slug === args[0] && m.subject === args[1]).map(m => ({role: m.role}));
    } else if (q.startsWith("INSERT INTO ff_organizer_dispatch.ff_campaign_organizer_members")) {
      if (s.members.some(m => m.slug === args[0] && m.subject === args[1])) throw new Error("duplicate");
      s.members.push({slug: args[0], subject: args[1], role: args[2]}); rowCount = 1;
    } else if (q.startsWith("UPDATE ff_organizer_dispatch.ff_campaign_organizer_members")) {
      for (const m of s.members) if (m.slug === args[0] && m.subject === args[1]) {m.role = args[2]; rowCount++;}
    } else if (q.startsWith("DELETE FROM ff_organizer_dispatch.ff_campaign_organizer_members")) {
      const before = s.members.length;
      s.members = s.members.filter(m => m.slug !== args[0] || m.subject !== args[1]); rowCount = before - s.members.length;
    } else if (q.startsWith("INSERT INTO ff_organizer_dispatch.ff_campaign_membership_audit")) {
      if (failAudit) throw new Error("Synthetic audit failure");
      s.audits.push({slug: args[0], actor: args[1], target: args[2], action: args[3], previous: args[4], next: args[5]}); rowCount = 1;
    } else throw new Error("Unimplemented test SQL: " + q);
    return {rows, rowCount: rowCount || rows.length};
  }
  const db = {
    executor: {query: (sql,args) => execute(state,sql,args)},
    async transaction(work) {
      const previous = tail;
      let unlock;
      tail = new Promise(resolve => {unlock = resolve;});
      await previous;
      const pending = structuredClone(state);
      try {const result = await work({query: (sql,args) => execute(pending,sql,args)}); state = pending; return result;}
      finally {unlock();}
    },
  };
  return {db, calls,
    async user(email, verified = true) {state.users.push({email,verified});},
    async member(slug,subject,role) {state.members.push({slug,subject,role});},
    async snapshot() {return structuredClone({members: state.members, audits: state.audits});},
    async breakAudit() {failAudit = true;},
    async close() {},
  };
}
