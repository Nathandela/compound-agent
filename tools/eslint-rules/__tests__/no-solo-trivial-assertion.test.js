import { RuleTester } from '@typescript-eslint/rule-tester'
import * as vitest from 'vitest'
import rule from '../rules/no-solo-trivial-assertion.js'

RuleTester.afterAll = vitest.afterAll
RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

ruleTester.run('no-solo-trivial-assertion', rule, {
  valid: [
    // toBeDefined followed by a specific assertion in the same test
    {
      code: `it('returns result', () => {
        const result = getData();
        expect(result).toBeDefined();
        expect(result.name).toBe('foo');
      });`,
      filename: '/project/src/search.test.ts',
    },
    // Multiple expects — toBeTruthy is not solo
    {
      code: `it('validates input', () => {
        const result = validate(input);
        expect(result).toBeTruthy();
        expect(result.errors).toEqual([]);
      });`,
      filename: '/project/src/validate.test.ts',
    },
    // toBeFalsy as a secondary assertion (multiple expects)
    {
      code: `it('checks falsy', () => {
        expect(a).toBe(1);
        expect(b).toBeFalsy();
      });`,
      filename: '/project/src/logic.test.ts',
    },
    // Not a test file — rule does not apply
    {
      code: `it('does something', () => {
        expect(value).toBeDefined();
      });`,
      filename: '/project/src/setup.ts',
    },
    // A specific assertion alone (toBe) — not trivial
    {
      code: `it('returns 42', () => {
        expect(compute()).toBe(42);
      });`,
      filename: '/project/src/compute.test.ts',
    },
    // test() with multiple expects including toBeDefined
    {
      code: `test('gets data', () => {
        const data = fetch();
        expect(data).toBeDefined();
        expect(data.id).toEqual(1);
      });`,
      filename: '/project/src/fetch.test.ts',
    },
    // Nested describe with multiple expects
    {
      code: `describe('suite', () => {
        it('works', () => {
          expect(result).toBeDefined();
          expect(result).toMatchObject({ a: 1 });
        });
      });`,
      filename: '/project/src/suite.test.ts',
    },
  ],
  invalid: [
    // Solo toBeDefined in it()
    {
      code: `it('returns result', () => {
        const result = getData();
        expect(result).toBeDefined();
      });`,
      filename: '/project/src/search.test.ts',
      errors: [{ messageId: 'soloTrivialAssertion' }],
    },
    // Solo toBeTruthy in it()
    {
      code: `it('works', () => {
        expect(fn()).toBeTruthy();
      });`,
      filename: '/project/src/fn.test.ts',
      errors: [{ messageId: 'soloTrivialAssertion' }],
    },
    // Solo toBeFalsy in test()
    {
      code: `test('is falsy', () => {
        expect(val()).toBeFalsy();
      });`,
      filename: '/project/src/val.test.ts',
      errors: [{ messageId: 'soloTrivialAssertion' }],
    },
    // Solo toBeDefined in test()
    {
      code: `test('exists', () => {
        expect(getItem()).toBeDefined();
      });`,
      filename: '/project/src/item.test.ts',
      errors: [{ messageId: 'soloTrivialAssertion' }],
    },
    // Solo toBeDefined inside nested describe
    {
      code: `describe('suite', () => {
        it('has data', () => {
          expect(data).toBeDefined();
        });
      });`,
      filename: '/project/src/data.test.ts',
      errors: [{ messageId: 'soloTrivialAssertion' }],
    },
    // Solo toBeTruthy with arrow function in it()
    {
      code: `it('validates', () => {
        const x = check();
        expect(x).toBeTruthy();
      });`,
      filename: '/project/src/check.spec.ts',
      errors: [{ messageId: 'soloTrivialAssertion' }],
    },
  ],
})
