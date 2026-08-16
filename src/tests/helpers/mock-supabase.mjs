// ============================================================
// Mock do Supabase em memória para testes unitários.
//
// O banco é um objeto { tabela: [registros...] }. As queries são
// encadeadas e executadas contra o banco atual (getDb()).
// ============================================================
import { randomUUID } from 'node:crypto';

function matches(row, filters) {
  return filters.every(({ col, val }) => {
    const rowVal = row[col];
    return String(rowVal) === String(val);
  });
}

function applyOrder(rows, order) {
  if (!order) return rows;
  const { col, ascending } = order;
  const sign = ascending ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}

export function createMockSupabase(getDb) {
  return {
    from(table) {
      const state = {
        filters: [],
        order: null,
        limitVal: null,
        opts: {},
        updateChanges: null,
        insertedId: null,
      };

      const api = {
        select(cols, opts) {
          state.opts = opts || {};
          return api;
        },
        eq(col, val) {
          state.filters.push({ col, val });
          return api;
        },
        order(col, opts) {
          state.order = { col, ascending: opts?.ascending !== false };
          return api;
        },
        limit(n) {
          state.limitVal = n;
          return api;
        },
        update(changes) {
          state.updateChanges = changes;
          return api;
        },
        insert(record) {
          const id = record.id || randomUUID();
          const full = { ...record, id };
          getDb()[table] = [...(getDb()[table] || []), full];
          state.insertedId = id;
          return api;
        },

        // Executa a query (compartilhado por maybeSingle e then).
        _run() {
          const db = getDb();
          let rows = [...(db[table] || [])];

          // Filtros
          rows = rows.filter((r) => matches(r, state.filters));

          // Update
          if (state.updateChanges) {
            rows = rows.map((r) => ({ ...r, ...state.updateChanges }));
            const updatedIds = rows.map((r) => r.id);
            db[table] = db[table].map((r) =>
              updatedIds.includes(r.id) ? { ...r, ...state.updateChanges } : r
            );
          }

          // Insert recém-criado
          if (state.insertedId) {
            rows = rows.filter((r) => r.id === state.insertedId);
          }

          // Count
          if (state.opts?.count === 'exact' && state.opts?.head) {
            return { data: null, count: rows.length, error: null };
          }

          // Ordena
          rows = applyOrder(rows, state.order);

          // Limite
          if (state.limitVal != null) {
            rows = rows.slice(0, state.limitVal);
          }

          return { data: rows, error: null };
        },

        async maybeSingle() {
          const result = this._run();
          if (result.count !== undefined) return result;
          return { data: result.data[0] ?? null, error: null };
        },

        then(resolve, reject) {
          try {
            const result = this._run();
            resolve(result);
          } catch (err) {
            reject(err);
          }
        },
      };

      return api;
    },
  };
}
