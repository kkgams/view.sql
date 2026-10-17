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
