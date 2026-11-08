/* 可选开发验收：只用 Node 内置模块，不是网站运行依赖。 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const seeds = fs.readFileSync(path.join(root, 'data/products.js'), 'utf8');

function application({ stored, blockRead = false } = {}) {
  const nodes = new Map();
  const fields = new Map();
  const data = new Map();
  let blockWrite = false;
  if (stored !== undefined) data.set('shanjian-tea.products.v1', stored);
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', innerHTML: '', hidden: true, open: false,
      children: [], dataset: {}, handlers: {}, disabled: false,
      elements: { namedItem(key) { if (!fields.has(key)) fields.set(key, { value: '', focus() {} }); return fields.get(key); } },
      addEventListener(type, callback) { this.handlers[type] = callback; },
      showModal() { this.open = true; }, close() { this.open = false; },
      reset() { for (const field of fields.values()) field.value = ''; },
      focus() {}, select() {}, setAttribute() {}, removeAttribute() {},
      scrollIntoView() {}, classList: { toggle() {} }
    });
    return nodes.get(id);
  };
  const document = { querySelector: node, querySelectorAll: () => [], handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } };
  const localStorage = {
    getItem(key) { if (blockRead) throw new Error('Denied'); return data.get(key) ?? null; },
    setItem(key, value) { if (blockWrite) throw new Error('QuotaExceededError'); data.set(key, value); },
    removeItem(key) { data.delete(key); }
  };
  const context = {
    document, localStorage, location: { hash: '#home' }, console,
    Date, Math, JSON, Number, String, Set, Error, Blob,
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
    scrollTo() {}, addEventListener() {},
    FormData: class { get(key) { return fields.get(key)?.value || ''; } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(seeds, context);
  vm.runInContext(source, context);
  const fire = (id, type) => node(id).handlers[type]({ preventDefault() {} });
  const click = (action, id) => document.handlers.click({ target: { closest(selector) { return selector === '[data-action]' ? { dataset: { action, id } } : null; } } });
  return { node, data, context, fields, fire, click, blockWrites() { blockWrite = true; } };
}

const first = application();
assert.equal(JSON.parse(first.data.get('shanjian-tea.products.v1')).length, 4);
assert.match(first.node('#product-grid').innerHTML, /西湖龙井/);
assert.match(first.node('#category-filters').innerHTML, /白茶/);
console.log('PASS 首次载入 4 款茶与动态分类');

const empty = application({ stored: '[]' });
assert.equal(empty.node('#product-grid').innerHTML, '');
assert.equal(empty.node('#empty-state').hidden, false);
assert.equal(empty.data.get('shanjian-tea.products.v1'), '[]');
console.log('PASS 删除全部产品后不重新填入示例');

const broken = application({ stored: '{invalid' });
assert.equal(broken.data.get('shanjian-tea.products.v1'), '{invalid');
assert.equal(broken.node('#storage-warning').hidden, false);
console.log('PASS 损坏数据保留原始存储并提示');

const denied = application({ blockRead: true });
assert.match(denied.node('#product-grid').innerHTML, /西湖龙井/);
assert.equal(denied.node('#storage-warning').hidden, false);
console.log('PASS 禁用存储时仍展示示例并提示');

const quota = application();
quota.node('#admin-key').value = '888888';
quota.fire('#login-form', 'submit');
const before = quota.data.get('shanjian-tea.products.v1');
quota.click('edit', 'tea-longjing');
quota.fields.get('name').value = '配额保护验证茶';
quota.blockWrites();
quota.fire('#tea-form', 'submit');
assert.equal(quota.data.get('shanjian-tea.products.v1'), before);
assert.equal(quota.fields.get('name').value, '配额保护验证茶');
assert.match(quota.node('#form-error').textContent, /保存失败，原数据已保留/);
assert.doesNotMatch(quota.node('#admin-list').innerHTML, /配额保护验证茶/);
console.log('PASS 配额耗尽时保留原产品与未保存表单');

const unauthorized = application();
unauthorized.click('delete', 'tea-longjing');
assert.equal(unauthorized.node('#login-dialog').open, true);
assert.equal(unauthorized.node('#delete-dialog').open, false);
assert.equal(JSON.parse(unauthorized.data.get('shanjian-tea.products.v1')).length, 4);
console.log('PASS 未登录的管理操作要求验证');

// 文本转义与存储读入同样使用应用入口验证。
const hostileTea = { ...quota.context.TEA_SEED_DATA[0], name: '<script>alert(1)</script>' };
const escaped = application({ stored: JSON.stringify([hostileTea]) });
assert.match(escaped.node('#product-grid').innerHTML, /&lt;script&gt;/);
assert.doesNotMatch(escaped.node('#product-grid').innerHTML, /<script>/);
console.log('PASS 用户输入按文本转义');

const ids = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length);
for (const id of [...source.matchAll(/\$\("#([a-zA-Z0-9_-]+)"\)/g)].map((match) => match[1])) assert.ok(ids.includes(id), `缺少 DOM 节点 ${id}`);
for (const asset of ['hero', 'longjing', 'dahongpao', 'puer', 'white-tea']) assert.ok(fs.statSync(path.join(root, 'assets', `${asset}.jpg`)).size > 1000);
console.log('PASS 静态节点、资源完整性');
