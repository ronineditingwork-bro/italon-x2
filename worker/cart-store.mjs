export function cartStore(env) {
  const db = env.DB;
  if (!db) throw new Error('Cart database binding is unavailable');
  return {
    async load(id) { return db.prepare('SELECT items, version FROM carts WHERE id = ?').bind(id).first(); },
    async create(id) {
      await db.prepare('INSERT OR IGNORE INTO carts (id, items, version, updated_at) VALUES (?, ?, 0, ?)')
        .bind(id, '[]', Date.now()).run();
      return this.load(id);
    },
    async replace(id, items, version) {
      const result = await db.prepare('UPDATE carts SET items = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
        .bind(JSON.stringify(items), Date.now(), id, version).run();
      return result.meta.changes === 1;
    },
  };
}
