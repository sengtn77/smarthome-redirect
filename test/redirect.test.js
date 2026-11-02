import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolveTarget } from '../src/redirect.js';

const INVALID_TEXT = 'Invalid login response.';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Fake browser environment. location.replace validates the URL with the WHATWG
// parser and throws a SyntaxError on failure, like the browser's DOMException.
function createEnv(search) {
  const replaced = [];
  const location = {
    search,
    replace(u) {
      try {
        new URL(u);
      } catch {
        throw new SyntaxError(`Invalid URL: ${u}`);
      }
      replaced.push(u);
    },
  };
  const document = { body: {} };
  return { location, document, URLSearchParams, replaced };
}

// Runs the page script in the fake environment and returns the page outcome:
// { replaced: <url> } or 'invalid'. Asserts exactly one of the two happened.
function runPage(code, search, extraGlobals = {}) {
  const env = createEnv(search);
  const context = vm.createContext({ ...env, ...extraGlobals });
  vm.runInContext(code, context);
  const showedInvalid = env.document.body.textContent === INVALID_TEXT;
  assert.ok(
    (env.replaced.length === 1) !== showedInvalid,
    'exactly one of replace() or the invalid text must happen',
  );
  assert.ok(env.replaced.length <= 1, 'replace() called at most once');
  return showedInvalid ? 'invalid' : { replaced: env.replaced[0] };
}

// Page-glue adapter: the <script type="module"> in index.html. The static import
// line is asserted exactly, stripped, and the real resolveTarget is injected.
const IMPORT_LINE = "import { resolveTarget } from './src/redirect.js';";

function pageGlueAdapter(search) {
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, 'index.html has a <script type="module">');
  const lines = match[1].split('\n');
  const importLines = lines.filter((line) => line.trim().startsWith('import'));
  assert.deepEqual(
    importLines.map((line) => line.trim()),
    [IMPORT_LINE],
    'module script has exactly the expected import line',
  );
  const code = '"use strict";\n' + lines.filter((line) => line.trim() !== IMPORT_LINE).join('\n');
  return runPage(code, search, { resolveTarget });
}

function makeSearch(target) {
  const state = encodeURIComponent(JSON.stringify({ r: target, n: 'N' }));
  return `?code=C&region=R&state=${state}`;
}

function validRow(name, target) {
  const search = makeSearch(target);
  return { name, search, resolved: target + search };
}

// Target already containing '?': the original joins with '&' and drops the
// query's leading '?'.
function withQueryRow(name, target) {
  const search = makeSearch(target);
  return { name, search, resolved: `${target}&${search.slice(1)}` };
}

const cases = [
  validRow('exp:// target without ?', 'exp://host/path'),
  validRow('exps:// target without ?', 'exps://host/path'),
  validRow('smarthome:// target without ?', 'smarthome://auth'),
  withQueryRow('exp:// target with existing ?', 'exp://host/path?x=1'),
  withQueryRow('target ending in bare ? (quirk: ?&code)', 'exp://host/path?'),
];

function stateSearch(rawState) {
  return `?code=C&region=R&state=${rawState}`;
}

function jsonStateSearch(value) {
  return stateSearch(encodeURIComponent(JSON.stringify(value)));
}

function invalidRow(name, search) {
  return { name, search, resolved: null };
}

const errorCases = [
  invalidRow('no state param', '?code=C&region=R'),
  invalidRow('empty state', stateSearch('')),
  invalidRow('malformed JSON state', stateSearch(encodeURIComponent('{"r":'))),
  invalidRow('non-JSON state', stateSearch('abc')),
  invalidRow('state=null', stateSearch('null')),
  invalidRow('non-object JSON state (5)', stateSearch('5')),
  invalidRow('state object without r', jsonStateSearch({ n: 'N' })),
  invalidRow('https:// scheme', makeSearch('https://example.com/cb')),
  invalidRow('javascript: scheme', makeSearch('javascript:alert(1)')),
  invalidRow('data: scheme', makeSearch('data:text/html,<b>x</b>')),
  invalidRow('uppercase EXP:// scheme', makeSearch('EXP://x')),
  invalidRow('leading space before scheme', makeSearch(' exp://x')),
  invalidRow('exp: without //', makeSearch('exp:x')),
  invalidRow('empty search string', ''),
];

// Quirk: String() coerces an array r, so ["exp://x"] is accepted.
const arraySearch = jsonStateSearch({ r: ['exp://x'], n: 'N' });
const quirkCases = [
  { name: 'array r is coerced and accepted (quirk)', search: arraySearch, resolved: 'exp://x' + arraySearch },
];

// Unparseable targets: the scheme check passes, so the page builds the URL, but
// location.replace throws and the page shows the invalid text. These rows reflect
// the WHATWG URL spec / Node behavior, not necessarily every browser.
function unparseableRow(name, target) {
  const search = makeSearch(target);
  return { name, search, resolved: target + search, page: 'invalid' };
}

const unparseableCases = [
  unparseableRow('unparseable URL: space in host', 'exp://a b'),
  unparseableRow('unparseable URL: unclosed IPv6 bracket', 'exp://['),
  unparseableRow('unparseable URL: port out of range', 'exp://h:99999'),
];

cases.push(...errorCases, ...quirkCases, ...unparseableCases);

function expectedPage(row) {
  if (row.page !== undefined) return row.page;
  return row.resolved === null ? 'invalid' : { replaced: row.resolved };
}

for (const row of cases) {
  test(`page (module glue): ${row.name}`, () => {
    assert.deepEqual(pageGlueAdapter(row.search), expectedPage(row));
  });
}

for (const row of cases) {
  test(`function: ${row.name}`, () => {
    assert.equal(resolveTarget(row.search), row.resolved);
  });
}

test('fake location.replace throws on an unparseable URL and records nothing', () => {
  const env = createEnv('');
  assert.throws(() => env.location.replace('exp://a b'), SyntaxError);
  assert.deepEqual(env.replaced, []);
});

// ---- Differential test against the original inline logic (git origin/main) ----
// Reference: the original IIFE body with location.replace captured instead of called.
function originalResolve(query) {
  try {
    var state = JSON.parse(new URLSearchParams(query).get('state'));
    var target = String(state.r);
    if (/^(exp|exps|smarthome):\/\//.test(target)) {
      return target + (target.indexOf('?') === -1 ? '' : '&') + (target.indexOf('?') === -1 ? query : query.slice(1));
    }
  } catch (e) {}
  return null;
}

// Deterministic PRNG (mulberry32); no clock or Math.random.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSearches(count) {
  const rnd = prng(12345);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const schemes = ['exp://', 'exps://', 'smarthome://', 'EXP://', ' exp://', 'exp:', 'https://', 'javascript:', 'data:', 'expo://', 'smarthome:/', ''];
  const tails = ['host/path', 'a b', '[', 'h:99999', 'x?', 'x?y=1', '?', '??', 'x#f', 'é/ü', '%20', '&=', 'x?a=1&b=2', ''];
  const rValues = () => {
    const t = pick(schemes) + pick(tails);
    switch (Math.floor(rnd() * 8)) {
      case 0: return [t];
      case 1: return [t, 'z'];
      case 2: return 5;
      case 3: return null;
      case 4: return { toString: 1 };
      case 5: return undefined;
      default: return t;
    }
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    const kind = Math.floor(rnd() * 10);
    const extra = pick(['', '&extra=1', '&a=b%26c', '&state=second', '&x=%E4%BD%A0']);
    let search;
    if (kind === 0) search = '';
    else if (kind === 1) search = '?code=C';
    else if (kind === 2) search = '?state=' + encodeURIComponent(pick(['', 'null', '5', '"x"', 'true', '[]', '{"r":', 'abc', '{"n":1}']));
    else if (kind === 3) search = 'code=C&state=' + encodeURIComponent(JSON.stringify({ r: rValues() })); // no leading ?
    else if (kind === 4) search = '?state=%ZZ' + extra;
    else {
      const state = pick([{ r: rValues(), n: 'N' }, { r: rValues() }, { n: 'N' }, rValues()]);
      search = '?code=C&region=R&state=' + encodeURIComponent(JSON.stringify(state)) + extra;
    }
    out.push(search);
  }
  return out;
}

test('differential: resolveTarget matches the original inline logic on 5000 generated inputs', () => {
  const searches = generateSearches(5000);
  let accepted = 0;
  for (const s of searches) {
    const expected = originalResolve(s);
    if (expected !== null) accepted++;
    assert.equal(resolveTarget(s), expected, `mismatch for ${JSON.stringify(s)}`);
  }
  assert.ok(accepted > 200, `generator should produce many accepted inputs (got ${accepted})`);
  assert.ok(accepted < 4800, 'generator should produce many rejected inputs');
});

test('differential: page glue matches original page outcome on generated inputs', () => {
  for (const s of generateSearches(500)) {
    const expected = originalResolve(s);
    let want = 'invalid';
    if (expected !== null) {
      try { new URL(expected); want = { replaced: expected }; } catch {}
    }
    assert.deepEqual(pageGlueAdapter(s), want, `page mismatch for ${JSON.stringify(s)}`);
  }
});

test('edge: search without leading ? and target with ? slices first char (original quirk)', () => {
  const state = encodeURIComponent(JSON.stringify({ r: 'exp://h?x=1' }));
  const s = `code=C&state=${state}`;
  assert.equal(resolveTarget(s), originalResolve(s));
  assert.equal(resolveTarget(s), `exp://h?x=1&ode=C&state=${state}`);
});

test('edge: object r with custom toString and non-string inputs are handled like the original', () => {
  for (const r of [{}, 5, null, true, [], [['exp://x']], ['smarthome://a', 'b']]) {
    const s = jsonStateSearch({ r });
    assert.equal(resolveTarget(s), originalResolve(s));
  }
});

test('edge: non-string search inputs never throw and match the original', () => {
  for (const s of [undefined, null, 5, {}]) {
    assert.equal(resolveTarget(s), originalResolve(s));
  }
});

test('edge: duplicate state params use the first; percent-decoding and + handled', () => {
  const good = encodeURIComponent(JSON.stringify({ r: 'exp://a' }));
  const bad = encodeURIComponent(JSON.stringify({ r: 'https://a' }));
  const s1 = `?state=${good}&state=${bad}`;
  const s2 = `?state=${bad}&state=${good}`;
  assert.equal(resolveTarget(s1), 'exp://a' + s1);
  assert.equal(resolveTarget(s2), null);
  const plus = '?state=' + JSON.stringify({ r: 'exp://a+b' }).replace(/ /g, '+');
  assert.equal(resolveTarget(plus), originalResolve(plus));
});
