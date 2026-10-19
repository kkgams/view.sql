import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

async function loadView(filename, globals = {}) {
    const registry = new Map()
    const context = vm.createContext({
        HTMLElement: class {},
        customElements: {
            get: tag => registry.get(tag),
            define(tag, View) {
                assert(!registry.has(tag), `duplicate View: ${tag}`)
                registry.set(tag, View)
            },
        },
        ...globals,
    })
    const source = await readFile(new URL(`../src/views/${filename}`, import.meta.url), 'utf8')
    // Substitute Host imports only; execute the actual View body.
    vm.runInContext(source.replace(/^import .*\n/gm, '').replaceAll('export class ', 'class '), context)
    return registry
}

for (const [filename, tag] of [
    ['view-sql.js', 'view-sql'],
    ['view-sql-console.js', 'view-sql-console'],
    ['sql-table-editor.js', 'sql-table-editor'],
]) {
    test(`${filename} registers exactly ${tag}`, async () => {
        const registry = await loadView(filename)
        assert.deepEqual([...registry.keys()], [tag])
        assert.equal(typeof registry.get(tag), 'function')
    })
}

test('console executes statements without splitting quoted semicolons', async () => {
    const calls = []
    const registry = await loadView('view-sql-console.js', {
        sqlConnection: {
            async exec(statement) { calls.push(['exec', statement]); return 1 },
            async queryRows(statement) {
                calls.push(['query', statement])
                return { columns: ['value'], rows: [{ value: 'a;b' }] }
            },
        },
    })
    const View = registry.get('view-sql-console')
    const view = new View()
    const statuses = []
    view.appendOutput = () => {}
    view.setStatus = (...status) => statuses.push(status)
    await view.executeQuery("INSERT INTO example VALUES ('a;b'); SELECT 'a;b' AS value;")
    assert.deepEqual(calls, [
        ['exec', "INSERT INTO example VALUES ('a;b')"],
        ['query', "SELECT 'a;b' AS value"],
    ])
    assert.deepEqual(statuses.at(-1), ['2 statements finished', 'success'])
})

for (const size of [0, 1, 100, 101, 376]) {
    for (const representation of ['array', 'Uint8Array']) {
        test(`browser renders ${size}-byte ${representation} BLOB without treating it as text or boolean`, async () => {
            const registry = await loadView('view-sql.js')
            const view = Object.create(registry.get('view-sql').prototype)
            const bytes = Array.from({ length: size }, (_, index) => index % 256)
            const value = representation === 'array' ? bytes : new Uint8Array(bytes)
            const before = Array.from(value)
            // No DOM factory: binary data must never enter the checkbox branch.
            for (const column of ['icon', 'active']) {
                const td = {}
                view.renderCell(td, value, column)
                assert.equal(td.textContent, `BLOB · ${size} ${size === 1 ? 'byte' : 'bytes'}`)
                assert.equal(td.title, undefined)
            }
            assert.deepEqual(Array.from(value), before)
        })
    }
}

test('browser refuses text editing of binary cells without changing existing edit state', async () => {
    const registry = await loadView('view-sql.js')
    const view = Object.create(registry.get('view-sql').prototype)
    const existingEdit = { column: 'name' }
    view.editingCell = existingEdit
    view.cancelEdit = () => assert.fail('binary cell must not start or replace a text edit')
    for (const value of [[], [137, 80, 78, 71], new Uint8Array(0), new Uint8Array(376)]) {
        view.startEdit({}, 0, 0, value, 'icon')
        assert.equal(view.editingCell, existingEdit)
    }
})

test('browser retains text truncation and scalar rendering', async () => {
    const registry = await loadView('view-sql.js')
    const view = Object.create(registry.get('view-sql').prototype)
    for (const value of ['short text', 'x'.repeat(100), 'x'.repeat(101), 42, 1n, null, undefined]) {
        const td = {}
        view.renderCell(td, value, 'value')
        if (typeof value === 'string' && value.length > 100) {
            assert.equal(td.textContent, value.substring(0, 100) + '...')
            assert.equal(td.title, value)
        } else {
            assert.equal(td.textContent, value ?? '')
        }
    }
})
