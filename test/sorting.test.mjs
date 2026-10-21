import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

class Element {
    constructor(tag) { this.tag = tag; this.dataset = {}; this.attributes = {}; this.children = []; this.events = {} }
    set innerHTML(value) { assert.equal(value, ''); this.children = [] }
    setAttribute(name, value) { this.attributes[name] = value }
    appendChild(child) { this.children.push(child) }
    addEventListener(name, callback) { this.events[name] = callback }
    focus() { this.focused = true }
    querySelectorAll() {
        return this.children.flatMap(child => [
            ...(child.tag === 'th' && child.dataset.action === 'sort' ? [child] : []),
            ...child.querySelectorAll(),
        ])
    }
}

async function createView(sql = {}) {
    let View
    const source = await readFile(new URL('../src/views/view-sql.js', import.meta.url), 'utf8')
    vm.runInNewContext(source.replace(/^import .*\n/gm, '').replace('export class ', 'class '), {
        HTMLElement: class {},
        document: { createElement: tag => new Element(tag) },
        customElements: { get() {}, define(tag, constructor) { View = constructor } },
        sql,
    })
    const view = new View()
    view.tableContainer = new Element('table')
    view.tablesContainer = new Element('table')
    view.updateChooserUI = view.updateHeaderControlsUI = view.updateSelectionUI = () => {}
    return view
}

test('headers activate directly by click, Enter and Space; aria-sort follows one active column', async () => {
    const view = await createView()
    view.selectedTable = 'items'
    view.columns = ['id', 'name']
    view.cancelEdit = () => { view.editingCell = null }
    view.fetchTableData = async () => view.renderTable()
    view.currentPage = 3
    view.selectedRowIndex = 4
    view.editingCell = {}
    view.renderTable()
    let headers = view.tableContainer.querySelectorAll()
    assert.equal(headers[0].attributes.tabindex, '0')
    await headers[0].events.click()
    assert.equal(view.currentPage, 0)
    assert.equal(view.selectedRowIndex, -1)
    assert.equal(view.editingCell, null)
    headers = view.tableContainer.querySelectorAll()
    assert.equal(headers[0].attributes['aria-sort'], 'ascending')
    assert.equal(headers[0].focused, true)
    for (const [key, direction] of [['Enter', 'descending'], [' ', 'ascending']]) {
        let prevented = false, stopped = false
        headers[0].events.keydown({ key, preventDefault() { prevented = true }, stopPropagation() { stopped = true } })
        await Promise.resolve()
        assert(prevented && stopped)
        headers = view.tableContainer.querySelectorAll()
        assert.equal(headers[0].attributes['aria-sort'], direction)
    }
    await headers[1].events.click()
    headers = view.tableContainer.querySelectorAll()
    assert.equal(headers[0].attributes['aria-sort'], undefined)
    assert.equal(headers[1].attributes['aria-sort'], 'ascending')
})

test('SQL sorts the complete table before pagination and quotes identifiers', async () => {
    const queries = []
    const view = await createView({
        async value() { return 80 },
        async queryObjects(query, columns, params) { queries.push([query, params]); return [] },
    })
    view.selectedTable = 'odd"table'
    view.columns = ['odd"column']
    view.fetchTableColumns = async () => view.columns
    view.detectPrimaryKey = async () => view.columns[0]
    view.renderPagination = view.setTablesStatus = view.setTableStatus = () => {}
    view.sortColumn = view.columns[0]
    view.currentPage = 2
    for (const [direction, keyword] of [['ascending', 'ASC'], ['descending', 'DESC']]) {
        view.sortDirection = direction
        await view.fetchTableData()
        assert.equal(queries.at(-1)[0], `SELECT * FROM "odd""table" ORDER BY "odd""column" ${keyword} LIMIT ? OFFSET ?`)
        assert.deepEqual(Array.from(queries.at(-1)[1]), ['20', '40'])
    }
    view.columns = ['replacement']
    await view.fetchTableData()
    assert.equal(view.sortColumn, null)
    assert(!queries.at(-1)[0].includes('ORDER BY'))
})

test('sidebar sorts row counts numerically and table changes reset row ordering', async () => {
    const view = await createView()
    view.tables = [{ name: 'z', rowCount: 2 }, { name: 'a', rowCount: 10 }]
    view.renderTables()
    await view.tablesContainer.querySelectorAll()[1].events.click()
    assert.equal(view.tablesContainer.children[1].children[0].dataset.table, 'z')
    await view.tablesContainer.querySelectorAll()[1].events.click()
    assert.equal(view.tablesContainer.children[1].children[0].dataset.table, 'a')
    await view.tablesContainer.querySelectorAll()[0].events.click()
    assert.equal(view.tablesContainer.children[1].children[0].dataset.table, 'a')
    view.sortColumn = 'old'
    view.cancelEdit = view.setTableStatus = () => {}
    view.fetchTableData = async () => {}
    await view.selectTable('new')
    assert.equal(view.sortColumn, null)
})
