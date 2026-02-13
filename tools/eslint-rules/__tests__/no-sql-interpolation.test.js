import { RuleTester } from '@typescript-eslint/rule-tester'
import * as vitest from 'vitest'
import rule from '../rules/no-sql-interpolation.js'

RuleTester.afterAll = vitest.afterAll
RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

ruleTester.run('no-sql-interpolation', rule, {
  valid: [
    // String literal (no interpolation) is fine
    {
      code: `db.prepare('SELECT * FROM t WHERE id = ?').get(id)`,
    },
    // Plain string literal
    {
      code: `db.prepare('SELECT * FROM t WHERE id = ?')`,
    },
    // Template literal with NO expressions is OK
    {
      code: 'database.prepare(`SELECT * FROM lessons`)',
    },
    // Template literal with no expressions on .run()
    {
      code: 'db.run(`INSERT INTO t DEFAULT VALUES`)',
    },
    // Non-SQL method with template literal is fine
    {
      code: 'db.log(`value is ${x}`)',
    },
    // Template literal on unrelated function
    {
      code: 'console.log(`SELECT * FROM t WHERE id = ${id}`)',
    },
    // Parameterized with .all()
    {
      code: `db.all('SELECT * FROM t WHERE x = ?', y)`,
    },
  ],
  invalid: [
    // .prepare() with interpolated template literal
    {
      code: 'db.prepare(`SELECT * FROM t WHERE id = \'${id}\'`)',
      errors: [{ messageId: 'noSqlInterpolation' }],
    },
    // .prepare() on a different receiver name
    {
      code: 'database.prepare(`INSERT INTO t VALUES (${val})`)',
      errors: [{ messageId: 'noSqlInterpolation' }],
    },
    // .run() with interpolation
    {
      code: 'stmt.run(`DELETE FROM t WHERE name = \'${name}\'`)',
      errors: [{ messageId: 'noSqlInterpolation' }],
    },
    // .exec() with interpolation
    {
      code: 'db.exec(`DROP TABLE ${tableName}`)',
      errors: [{ messageId: 'noSqlInterpolation' }],
    },
    // .all() with interpolation
    {
      code: 'db.all(`SELECT * FROM t WHERE x = ${y}`)',
      errors: [{ messageId: 'noSqlInterpolation' }],
    },
    // .get() with interpolation
    {
      code: 'db.get(`SELECT * FROM t WHERE id = ${id}`)',
      errors: [{ messageId: 'noSqlInterpolation' }],
    },
    // Nested member expression (this.db.prepare)
    {
      code: 'this.db.prepare(`SELECT * FROM t WHERE id = ${id}`)',
      errors: [{ messageId: 'noSqlInterpolation' }],
    },
  ],
})
