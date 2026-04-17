/**
 * 轻量级前端测试运行器
 * 在浏览器环境中运行，可以直接测试与 DOM / localStorage / IndexedDB 相关的功能
 *
 * 使用方法：在浏览器控制台执行 TM._testRunner.runAll()
 * 或打开 tests/index.html
 */
(function (w) {
  w.TM = w.TM || {};

  const suites = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  function describe(name, fn) {
    suites.push({ name, fn });
  }

  function createSuite(suiteName) {
    const tests = [];
    const _beforeEach = [];
    const _afterEach = [];

    function it(name, fn) {
      tests.push({ name, fn });
    }

    function beforeEach(fn) {
      _beforeEach.push(fn);
    }

    function afterEach(fn) {
      _afterEach.push(fn);
    }

    return { tests, it, beforeEach, afterEach, _beforeEach, _afterEach };
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assert.equal = function (a, b, msg) {
    if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  };

  assert.deepEqual = function (a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(msg || `Deep equal failed:\n  got:    ${JSON.stringify(a)}\n  expect: ${JSON.stringify(b)}`);
    }
  };

  assert.ok = function (val, msg) {
    if (!val) throw new Error(msg || `Expected truthy, got ${val}`);
  };

  assert.throws = function (fn, msg) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    if (!threw) throw new Error(msg || 'Expected function to throw');
  };

  class SkipError {
    constructor(reason) { this.reason = reason || 'precondition not met'; }
  }

  function skip(reason) {
    throw new SkipError(reason);
  }

  async function runAll(options) {
    const log = options?.log || console.log.bind(console);
    totalPassed = 0;
    totalFailed = 0;
    totalSkipped = 0;
    const results = [];

    for (const suite of suites) {
      log(`\n📋 ${suite.name}`);
      const ctx = createSuite(suite.name);
      suite.fn(ctx.it, ctx.beforeEach, ctx.afterEach, assert);

      for (const test of ctx.tests) {
        for (const bfn of ctx._beforeEach) await bfn();
        try {
          await test.fn(assert, skip);
          totalPassed++;
          log(`  ✅ ${test.name}`);
          results.push({ suite: suite.name, test: test.name, status: 'passed' });
        } catch (err) {
          if (err instanceof SkipError) {
            totalSkipped++;
            log(`  ⏭️ ${test.name} [SKIP: ${err.reason}]`);
            results.push({ suite: suite.name, test: test.name, status: 'skipped', reason: err.reason });
          } else {
            totalFailed++;
            log(`  ❌ ${test.name}: ${err.message}`);
            results.push({ suite: suite.name, test: test.name, status: 'failed', error: err.message });
          }
        }
        for (const afn of ctx._afterEach) await afn();
      }
    }

    log(`\n📊 Results: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`);
    return { passed: totalPassed, failed: totalFailed, skipped: totalSkipped, results };
  }

  w.TM._testRunner = {
    describe,
    assert,
    skip,
    runAll,
    suites,
  };
})(window);
