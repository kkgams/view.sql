import { runtime, unwrap } from "/core/runtime.js"
import { registerViewPlugin, unregisterViewPlugin } from "/util/view-plugin.js"
import { rowsFromCells, sql } from "/util/sql.js"
import "/widgets/view-pagination.js"

function quoteIdent(name) {
    return String(name).replace(/"/g, '""')
}

function sqlIdent(name) {
    return `"${quoteIdent(name)}"`
}

function assert(condition, message) {
    if (!condition) throw new Error(message)
}

export class ViewSql extends HTMLElement {
    static get observedAttributes() {
        return [
            "data-mode",
            "data-query",
            "data-count-query",
            "data-page-size",
            "data-confirm-label",
            "data-return-column",
            "data-return-fields",
        ]
    }

    constructor() {
        super()
        this.popupProps = this.popupProps || {}
        this.tables = []
        this.selectedTable = null
        this.rows = []
        this.columns = []
        this.currentPage = 0
        this.pageSize = 20
        this.totalCount = 0
        this.mode = "browser"
        this.query = ""
        this.countQuery = ""
        this.confirmLabel = "Select"
        this.valueLabel = "Name"
        this.value = ""
        this.returnColumn = ""
        this.returnFields = []
        this.selectedRowIndex = -1
        this.primaryKey = ""
        this.editingCell = null
        this.tablesPaneElement = null
        this.tablesContainer = null
        this.tablesStatusContainer = null
        this.tableContainer = null
        this.paginationElement = null
        this.tableStatusContainer = null
        this.actionCancelButton = null
        this.actionSelectButton = null
        this.actionValueInput = null
        this._headerControlsElement = null
    }

    connectedCallback() {
        registerViewPlugin(this)
        if (this.dataset.ready) {
            this._mountHeaderControls()
            this.updateHeaderControlsUI()
            return
        }
        this.dataset.ready = "1"

        this.style.display = "contents"

        this.innerHTML = `
      <aside data-element="tables-pane">
        <table data-element="tables-container"></table>
        <output data-element="tables-status"></output>
      </aside>
      <article>
        <table data-element="table-container"></table>
      </article>
      <footer data-element="footer">
        <output data-element="status"></output>
        <view-pagination data-page="0" data-page-size-options="10,20,50,100"></view-pagination>
      </footer>
    `

        this.tablesPaneElement = this.querySelector('[data-element="tables-pane"]')
        this.tablesContainer = this.querySelector('[data-element="tables-container"]')
        this.tablesStatusContainer = this.querySelector('[data-element="tables-status"]')
        this.tableContainer = this.querySelector('[data-element="table-container"]')
        this.paginationElement = this.querySelector("view-pagination")
        this.tableStatusContainer = this.querySelector('[data-element="status"]')

        this.readConfig()
        this._mountHeaderControls()
        this.renderFooter()
        this.updateModeUI()

        this.paginationElement?.addEventListener("change", async (event) => {
            this.currentPage = event.detail.page
            this.pageSize = event.detail.pageSize
            this.selectedRowIndex = -1
            this.cancelEdit()
            if (this.mode === "chooser" || this.mode === "saver") {
                await this.fetchQueryData()
                this.renderTable()
                this.renderPagination()
                this.updateChooserUI()
                this.setTableStatus(`${this.totalCount} rows`)
                return
            }
            await this.fetchTableData()
        })

        this.addEventListener("keydown", (event) => this.handleKeyDown(event))

        this.refresh()
    }

    disconnectedCallback() {
        this._unmountHeaderControls()
        void unregisterViewPlugin(this)
    }

    createHeaderControlsElement() {
        const toolbar = document.createElement("div")
        toolbar.dataset.element = "toolbar"
        toolbar.setAttribute("slot", "header-controls")
        toolbar.innerHTML = `
      <button data-action="refresh" aria-label="Reload" title="Reload"><i aria-hidden="true">refresh</i></button>
      <button data-action="insert" aria-label="Insert row" title="Insert row"><i aria-hidden="true">add</i></button>
      <button data-action="delete" aria-label="Delete row" title="Delete row"><i aria-hidden="true">remove</i></button>
      <button data-action="create-table" aria-label="Create table" title="Create table"><i aria-hidden="true">post_add</i></button>
    `
        return toolbar
    }

    _mountHeaderControls() {
        if (!this.parentElement || this._headerControlsElement) return

        const headerControls = this.createHeaderControlsElement()
        this._headerControlsElement = headerControls
        this.parentElement.appendChild(headerControls)
        this._bindHeaderControls()
        this.updateHeaderControlsUI()
    }

    _bindHeaderControls() {
        const toolbar = this._headerControlsElement
        assert(toolbar instanceof HTMLElement, "view-sql header controls not mounted")
        toolbar.querySelector('[data-action="refresh"]').addEventListener("click", () => this.refresh(null))
        toolbar.querySelector('[data-action="insert"]').addEventListener("click", () => this.insertRow())
        toolbar.querySelector('[data-action="delete"]').addEventListener("click", () => this.deleteSelected())
        toolbar
            .querySelector('[data-action="create-table"]')
            .addEventListener("click", () => this.openCreateTablePopup())
    }

    _unmountHeaderControls() {
        if (this._headerControlsElement?.parentElement) {
            this._headerControlsElement.remove()
        }
        this._headerControlsElement = null
    }

    updateHeaderControlsUI() {
        if (!this._headerControlsElement) return
        const canEdit = this.mode === "browser" && !!this.selectedTable
        const insertButton = this._headerControlsElement.querySelector('[data-action="insert"]')
        if (insertButton instanceof HTMLButtonElement) {
            insertButton.disabled = !canEdit || this.columns.length === 0
        }
        const deleteButton = this._headerControlsElement.querySelector('[data-action="delete"]')
        if (deleteButton instanceof HTMLButtonElement) {
            deleteButton.disabled = !canEdit || this.selectedRowIndex < 0
        }
        const createTableButton = this._headerControlsElement.querySelector('[data-action="create-table"]')
        if (createTableButton instanceof HTMLButtonElement) {
            createTableButton.disabled = this.mode !== "browser"
        }
    }

    readConfig() {
        const props = this.popupProps || {}
        this.mode = String(props.mode || this.getAttribute("data-mode") || "browser")
        this.query = String(props.query || this.getAttribute("data-query") || "")
        this.countQuery = String(props.countQuery || this.getAttribute("data-count-query") || "")
        this.confirmLabel = String(
            props.confirmLabel ||
                this.getAttribute("data-confirm-label") ||
                (this.mode === "saver" ? "Save" : "Select"),
        )
        this.valueLabel = String(props.valueLabel || this.getAttribute("data-value-label") || "Name")
        this.value = String(props.value ?? this.getAttribute("data-value") ?? "")
        this.returnColumn = String(props.returnColumn || this.getAttribute("data-return-column") || "")
        const returnFieldsInput = props.returnFields ?? this.getAttribute("data-return-fields") ?? ""
        this.returnFields = Array.isArray(returnFieldsInput)
            ? returnFieldsInput.map((field) => String(field)).filter(Boolean)
            : String(returnFieldsInput)
                  .split(",")
                  .map((field) => field.trim())
                  .filter(Boolean)

        const pageSizeValue = props.pageSize ?? this.getAttribute("data-page-size") ?? "20"
        const parsedPageSize = parseInt(String(pageSizeValue), 10)
        this.pageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 20
    }

    renderFooter() {
        const footer = this.querySelector('[data-element="footer"]')
        if (!(footer instanceof HTMLElement)) return

        this.actionCancelButton?.remove()
        this.actionSelectButton?.remove()
        this.actionValueInput?.remove()
        this.actionCancelButton = null
        this.actionSelectButton = null
        this.actionValueInput = null

        if (this.mode !== "chooser" && this.mode !== "saver") return

        this.actionCancelButton = document.createElement("button")
        this.actionCancelButton.type = "button"
        this.actionCancelButton.dataset.action = "cancel"
        this.actionCancelButton.textContent = "Cancel"
        this.actionCancelButton.addEventListener("click", async () => {
            unwrap(await runtime.call("ui.popup.close", { cancelled: true, ok: false }))
        })
        footer.appendChild(this.actionCancelButton)

        if (this.mode === "saver") {
            this.actionValueInput = document.createElement("input")
            this.actionValueInput.type = "text"
            this.actionValueInput.value = this.value
            this.actionValueInput.placeholder = this.valueLabel
            this.actionValueInput.setAttribute("aria-label", this.valueLabel)
            this.actionValueInput.setAttribute("autocomplete", "off")
            this.actionValueInput.setAttribute("autocorrect", "off")
            this.actionValueInput.setAttribute("autocapitalize", "off")
            this.actionValueInput.spellcheck = false
            this.actionValueInput.addEventListener("input", () => {
                this.value = this.actionValueInput.value
                this.updateChooserUI()
            })
            footer.appendChild(this.actionValueInput)
        }

        this.actionSelectButton = document.createElement("button")
        this.actionSelectButton.type = "button"
        this.actionSelectButton.dataset.action = "select"
        this.actionSelectButton.classList.add("accent")
        this.actionSelectButton.textContent = this.confirmLabel
        this.actionSelectButton.addEventListener("click", async () => {
            await this.confirmSelection()
        })
        footer.appendChild(this.actionSelectButton)
    }

    updateModeUI() {
        if (this.tablesPaneElement instanceof HTMLElement) {
            this.tablesPaneElement.hidden = this.mode === "chooser" || this.mode === "saver"
        }
        this.updateHeaderControlsUI()
        this.updateChooserUI()
    }

    async refresh(tableToSelect = null) {
        this.cancelEdit()
        this.readConfig()
        this.renderFooter()
        this.updateModeUI()

        if (this.mode === "chooser" || this.mode === "saver") {
            this.setTableStatus("Loading...")
            this.setTablesStatus("")
            this.selectedTable = null
            this.selectedRowIndex = -1
            await this.fetchQueryData()
            this.renderTable()
            this.renderPagination()
            this.updateChooserUI()
            this.setTableStatus(`${this.totalCount} rows`)
            return
        }

        if (tableToSelect !== null) {
            this.selectedTable = tableToSelect
            this.currentPage = 0
            this.selectedRowIndex = -1
            this.cancelEdit()
        }

        this.setTablesStatus("Loading...")
        this.setTableStatus("Loading...")
        await this.fetchTables()
        this.renderTables()
        if (this.selectedTable) {
            await this.fetchTableData()
        } else {
            this.columns = []
            this.rows = []
            this.totalCount = 0
            this.renderTable()
            this.renderPagination()
            this.setTablesStatus(`${this.tables.length} tables`)
            this.setTableStatus("No table selected")
            this.updateHeaderControlsUI()
        }
    }

    async fetchTables() {
        const schemaQuery = `SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
        const tables = await sql.queryObjects(schemaQuery, ["name"])

        this.tables = []
        for (const table of tables) {
            const name = table.name
            const rowCount = Number(await sql.value(`SELECT COUNT(*) as count FROM ${sqlIdent(name)}`)) || 0
            this.tables.push({ name, rowCount })
        }

        if (!this.selectedTable || !this.tables.some((table) => table.name === this.selectedTable)) {
            this.selectedTable = this.tables[0] ? this.tables[0].name : null
            this.currentPage = 0
        }
    }

    async fetchTableData() {
        if (!this.selectedTable) return

        const tableName = sqlIdent(this.selectedTable)
        this.totalCount = Number(await sql.value(`SELECT COUNT(*) AS count FROM ${tableName}`)) || 0

        const offset = this.currentPage * this.pageSize
        this.columns = await this.fetchTableColumns(this.selectedTable)
        this.primaryKey = await this.detectPrimaryKey(this.selectedTable, this.columns)
        this.rows =
            this.columns.length > 0
                ? await sql.queryObjects(`SELECT * FROM ${tableName} LIMIT ? OFFSET ?`, this.columns, [
                      String(this.pageSize),
                      String(offset),
                  ])
                : []

        this.renderTable()
        this.renderPagination()
        this.setTablesStatus(`${this.tables.length} tables`)
        this.setTableStatus(`${this.totalCount} rows`)
        this.updateHeaderControlsUI()
    }

    async fetchTableInfo(tableName) {
        return await sql.queryObjects(`PRAGMA table_info(${sqlIdent(tableName)})`, [
            "cid",
            "name",
            "type",
            "notnull",
            "dflt_value",
            "pk",
        ])
    }

    async fetchTableColumns(tableName) {
        return (await this.fetchTableInfo(tableName)).map((column) => column.name)
    }

    async detectPrimaryKey(tableName, columns) {
        const tableInfo = await this.fetchTableInfo(tableName)
        const pkRow = tableInfo.find((column) => Number(column.pk) > 0)
        if (pkRow?.name) return pkRow.name
        if (columns.includes("id")) return "id"
        return columns[0] || ""
    }

    interpolateQuery(query, params) {
        return String(query).replace(/:(\w+)/g, (match, name) => {
            if (!(name in params)) return match
            const value = params[name]
            if (typeof value === "string") {
                return `'${value.replace(/'/g, "''")}'`
            }
            return String(value)
        })
    }

    async fetchQueryData() {
        assert(this.query, "view-sql chooser/saver mode requires query")
        assert(this.countQuery, "view-sql chooser/saver mode requires countQuery")

        const params = {
            offset: this.currentPage * this.pageSize,
            limit: this.pageSize,
            pageSize: this.pageSize,
            page: this.currentPage,
        }

        this.totalCount = Number(await sql.value(this.interpolateQuery(this.countQuery, params))) || 0

        const result = rowsFromCells(await sql.queryCells(this.interpolateQuery(this.query, params)))
        this.columns = result.columns
        this.rows = result.rows
    }

    async openCreateTablePopup() {
        const payload = unwrap(
            await runtime.call("ui.popup.open", {
                title: "Create New Table",
                size: "medium",
                tag: "sql-table-editor",
                props: { mode: "create" },
            }),
        )

        if (payload?.reload) {
            await this.refresh(payload.tableName ?? null)
        }
    }

    renderTables() {
        this.tablesContainer.innerHTML = ""

        const head = document.createElement("thead")
        head.innerHTML = "<tr><th>Name</th><th>Rows</th></tr>"
        this.tablesContainer.appendChild(head)

        const body = document.createElement("tbody")
        this.tablesContainer.appendChild(body)

        for (const tableInfo of this.tables) {
            const row = document.createElement("tr")
            row.dataset.element = "table-row"
            row.dataset.table = tableInfo.name
            row.setAttribute("role", "button")
            row.setAttribute("tabindex", "0")

            const nameCell = document.createElement("td")
            nameCell.textContent = tableInfo.name

            const countCell = document.createElement("td")
            countCell.textContent = tableInfo.rowCount >= 0 ? String(tableInfo.rowCount) : "?"

            row.appendChild(nameCell)
            row.appendChild(countCell)

            row.addEventListener("click", () => this.selectTable(tableInfo.name))
            row.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    this.selectTable(tableInfo.name)
                }
            })

            body.appendChild(row)
        }

        this.updateSelectionUI()
        this.updateHeaderControlsUI()
    }

    async selectTable(tableName) {
        if (tableName === this.selectedTable) return
        this.selectedTable = tableName
        this.currentPage = 0
        this.selectedRowIndex = -1
        this.cancelEdit()
        this.updateSelectionUI()
        this.updateHeaderControlsUI()
        this.setTableStatus(`Loading ${tableName}...`)
        await this.fetchTableData()
    }

    updateSelectionUI() {
        this.querySelectorAll('[data-element="table-row"]').forEach((row) => {
            const isSelected = row.dataset.table === this.selectedTable
            row.setAttribute("aria-selected", isSelected ? "true" : "false")
        })
    }

    renderTable() {
        this.tableContainer.innerHTML = ""

        const tbody = document.createElement("tbody")

        if (this.mode !== "chooser" && this.mode !== "saver" && !this.selectedTable) {
            const tr = document.createElement("tr")
            const td = document.createElement("td")
            td.textContent = "Select a table."
            tr.appendChild(td)
            tbody.appendChild(tr)
            this.tableContainer.appendChild(tbody)
            return
        }

        if (this.columns.length === 0) {
            const tr = document.createElement("tr")
            const td = document.createElement("td")
            td.textContent = "No data. Set data-query attribute or check your query."
            tr.appendChild(td)
            tbody.appendChild(tr)
            this.tableContainer.appendChild(tbody)
            return
        }

        const colgroup = document.createElement("colgroup")
        this.columns.forEach(() => {
            colgroup.appendChild(document.createElement("col"))
        })
        this.tableContainer.appendChild(colgroup)

        const thead = document.createElement("thead")
        const headerRow = document.createElement("tr")
        this.columns.forEach((column) => {
            const th = document.createElement("th")
            th.textContent = column
            th.dataset.column = column
            headerRow.appendChild(th)
        })
        thead.appendChild(headerRow)
        this.tableContainer.appendChild(thead)

        this.rows.forEach((row, rowIndex) => {
            const tr = document.createElement("tr")
            tr.dataset.rowIndex = String(rowIndex)
            tr.setAttribute("aria-selected", rowIndex === this.selectedRowIndex ? "true" : "false")
            tr.addEventListener("click", () => this.selectRow(rowIndex))
            tr.addEventListener("dblclick", async () => {
                this.selectRow(rowIndex)
                if (this.mode === "chooser" || this.mode === "saver") await this.confirmSelection()
            })

            this.columns.forEach((column, colIndex) => {
                const td = document.createElement("td")
                td.dataset.column = column
                td.dataset.rowIndex = String(rowIndex)
                td.dataset.colIndex = String(colIndex)
                this.renderCell(td, row[column], column)
                td.addEventListener("dblclick", (event) => {
                    if (this.mode === "chooser" || this.mode === "saver") return
                    event.stopPropagation()
                    this.selectRow(rowIndex)
                    this.startEdit(td, rowIndex, colIndex, row[column], column)
                })
                tr.appendChild(td)
            })
            tbody.appendChild(tr)
        })
        this.tableContainer.appendChild(tbody)
        this.updateChooserUI()
    }

    renderCell(td, value, column) {
        const colType = this.detectColumnType(column, value)

        switch (colType) {
            case "boolean": {
                const checkbox = document.createElement("input")
                checkbox.type = "checkbox"
                checkbox.checked = value === "1" || value === "true" || value === true
                checkbox.disabled = true
                td.appendChild(checkbox)
                break
            }
            case "number":
                td.textContent = value ?? ""
                break
            default:
                if (value && value.length > 100) {
                    td.textContent = value.substring(0, 100) + "..."
                    td.title = value
                } else {
                    td.textContent = value ?? ""
                }
        }
    }

    detectColumnType(column, value) {
        const lowerCol = String(column || "").toLowerCase()
        const booleanWords = [
            "enabled",
            "disabled",
            "stackable",
            "active",
            "visible",
            "hidden",
            "locked",
            "deleted",
            "archived",
            "published",
            "featured",
            "verified",
            "approved",
            "completed",
            "required",
            "optional",
            "default",
        ]

        if (booleanWords.includes(lowerCol)) return "boolean"
        if (typeof value === "number") return "number"
        if (typeof value === "string" && value.trim() && /^-?\d+(\.\d+)?$/.test(value.trim())) return "number"
        return "text"
    }

    renderPagination() {
        if (!this.paginationElement) return
        this.paginationElement.page = this.currentPage
        this.paginationElement.pageSize = this.pageSize
        this.paginationElement.totalCount = this.totalCount
    }

    selectRow(rowIndex) {
        this.selectedRowIndex = rowIndex
        if (this.mode === "saver") {
            const selection = this.getSelection()
            const projected = this.projectSelection(selection)
            const nextValue = String(projected?.value ?? selection?.primaryKeyValue ?? "")
            if (nextValue.length > 0) {
                this.value = nextValue
                if (this.actionValueInput instanceof HTMLInputElement) this.actionValueInput.value = nextValue
            }
        }
        this.querySelectorAll("tr[data-row-index]").forEach((row) => {
            row.setAttribute("aria-selected", Number(row.dataset.rowIndex) === rowIndex ? "true" : "false")
        })
        this.updateHeaderControlsUI()
        this.updateChooserUI()
    }

    getSelection() {
        const row = this.rows[this.selectedRowIndex]
        if (!row) return null

        const primaryKey = this.columns.includes("id") ? "id" : this.columns[0] || null
        return {
            row,
            rowIndex: this.selectedRowIndex,
            primaryKey,
            primaryKeyValue: primaryKey ? (row[primaryKey] ?? null) : null,
        }
    }

    projectSelection(selection) {
        if (!selection) return null

        let value = selection.row
        if (this.returnColumn) {
            value = selection.row?.[this.returnColumn]
        } else if (this.returnFields.length > 0) {
            value = {}
            for (const field of this.returnFields) {
                value[field] = selection.row?.[field]
            }
        }

        return {
            ...selection,
            value,
        }
    }

    updateChooserUI() {
        if (this.mode !== "chooser" && this.mode !== "saver") return
        const selection = this.getSelection()
        const projected = this.projectSelection(selection)
        if (this.actionSelectButton instanceof HTMLButtonElement) {
            this.actionSelectButton.textContent = this.confirmLabel
            this.actionSelectButton.disabled = this.mode === "chooser" ? !selection : this.value.trim().length === 0
        }
        this.dispatchEvent(
            new CustomEvent("selection-changed", {
                bubbles: true,
                detail: { selection: projected },
            }),
        )
    }

    async confirmSelection() {
        const selection = this.getSelection()
        if (this.mode === "chooser" && !selection) return
        if (this.mode === "saver") {
            const value = this.value.trim()
            if (!value) return
            unwrap(
                await runtime.call("ui.popup.close", {
                    ok: true,
                    cancelled: false,
                    value,
                    row: selection?.row || null,
                    selection: this.projectSelection(selection),
                }),
            )
            return
        }
        unwrap(await runtime.call("ui.popup.close", this.projectSelection(selection)))
    }

    startEdit(td, rowIndex, colIndex, currentValue, column) {
        this.cancelEdit()

        const colType = this.detectColumnType(column, currentValue)
        this.editingCell = {
            td,
            rowIndex,
            colIndex,
            column,
            originalValue: currentValue ?? "",
        }

        td.dataset.editing = "true"
        td.innerHTML = ""

        const input = document.createElement(
            colType === "text" && String(currentValue ?? "").length > 50 ? "textarea" : "input",
        )
        if (input instanceof HTMLInputElement) {
            input.type = colType === "boolean" ? "checkbox" : colType === "number" ? "number" : "text"
            if (input.type === "checkbox")
                input.checked = currentValue === "1" || currentValue === "true" || currentValue === true
            else input.value = currentValue ?? ""
        } else {
            input.value = currentValue ?? ""
        }

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !(input instanceof HTMLTextAreaElement && event.shiftKey)) {
                event.preventDefault()
                void this.commitEdit()
                return
            }
            if (event.key === "Escape") {
                event.preventDefault()
                this.cancelEdit()
                return
            }
            if (event.key === "Tab") {
                event.preventDefault()
                const direction = event.shiftKey ? -1 : 1
                void this.commitEdit().then(() => this.startEditAt(rowIndex, colIndex + direction))
            }
        })
        input.addEventListener("blur", () => {
            if (this.editingCell?.td === td) void this.commitEdit()
        })
        if (input instanceof HTMLInputElement && input.type === "checkbox") {
            input.addEventListener("change", () => void this.commitEdit())
        }

        td.appendChild(input)
        input.focus()
        if (input instanceof HTMLInputElement && input.type !== "checkbox") input.select()
        if (input instanceof HTMLTextAreaElement) input.select()
    }

    startEditAt(rowIndex, colIndex) {
        let nextRowIndex = rowIndex
        let nextColIndex = colIndex
        if (nextColIndex < 0) {
            nextColIndex = this.columns.length - 1
            nextRowIndex--
        } else if (nextColIndex >= this.columns.length) {
            nextColIndex = 0
            nextRowIndex++
        }
        if (nextRowIndex < 0 || nextRowIndex >= this.rows.length) return

        const column = this.columns[nextColIndex]
        const row = this.rows[nextRowIndex]
        const td = this.tableContainer.querySelector(
            `td[data-row-index="${nextRowIndex}"][data-col-index="${nextColIndex}"]`,
        )
        assert(td instanceof HTMLTableCellElement, "editable table cell not found")
        this.selectRow(nextRowIndex)
        this.startEdit(td, nextRowIndex, nextColIndex, row[column], column)
    }

    cancelEdit() {
        if (!this.editingCell) return
        const { td, column, originalValue } = this.editingCell
        td.removeAttribute("data-editing")
        td.innerHTML = ""
        this.renderCell(td, originalValue, column)
        this.editingCell = null
    }

    async commitEdit() {
        if (!this.editingCell) return

        const { td, rowIndex, column, originalValue } = this.editingCell
        const input = td.querySelector("input, textarea")
        assert(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement, "edit input not found")

        const newValue =
            input instanceof HTMLInputElement && input.type === "checkbox" ? (input.checked ? "1" : "0") : input.value

        this.editingCell = null
        td.removeAttribute("data-editing")
        td.innerHTML = ""

        if (newValue === String(originalValue ?? "")) {
            this.renderCell(td, originalValue, column)
            return
        }

        const pkWhereValue = column === this.primaryKey ? originalValue : this.rows[rowIndex][this.primaryKey]
        this.rows[rowIndex][column] = newValue
        this.renderCell(td, newValue, column)

        try {
            await this.updateRow(rowIndex, column, newValue, pkWhereValue)
            this.setTableStatus(`Updated ${column}`)
        } catch (error) {
            this.rows[rowIndex][column] = originalValue
            td.innerHTML = ""
            this.renderCell(td, originalValue, column)
            this.setTableStatus(`Update error: ${error.message}`)
        }
    }

    async updateRow(rowIndex, column, value, pkWhereValue = undefined) {
        assert(this.selectedTable, "Cannot update: no table selected")
        assert(this.primaryKey, "Cannot update: no primary key column")

        const row = this.rows[rowIndex]
        const pkValue = pkWhereValue ?? row[this.primaryKey]
        assert(pkValue !== undefined && pkValue !== null && pkValue !== "", "Cannot update: no primary key value")

        await sql.exec(
            `UPDATE ${sqlIdent(this.selectedTable)} SET ${sqlIdent(column)} = ? WHERE ${sqlIdent(this.primaryKey)} = ?`,
            [String(value ?? ""), String(pkValue)],
        )
    }

    async insertRow() {
        if (this.mode !== "browser") return
        assert(this.selectedTable, "Cannot insert: no table selected")
        assert(this.columns.length > 0, "Cannot insert: no columns loaded")

        const insertColumns = this.columns.filter((column) => column !== this.primaryKey)
        const insertSql =
            insertColumns.length > 0
                ? `INSERT INTO ${sqlIdent(this.selectedTable)} (${insertColumns.map(sqlIdent).join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`
                : `INSERT INTO ${sqlIdent(this.selectedTable)} DEFAULT VALUES`
        try {
            await sql.exec(
                insertSql,
                insertColumns.map(() => ""),
            )
            this.setTableStatus("Row inserted")
            this.totalCount =
                Number(await sql.value(`SELECT COUNT(*) AS count FROM ${sqlIdent(this.selectedTable)}`)) || 0
            this.currentPage = Math.max(0, Math.ceil(this.totalCount / this.pageSize) - 1)
            this.selectedRowIndex = -1
            await this.fetchTableData()
        } catch (error) {
            this.setTableStatus(`Insert error: ${error.message}`)
        }
    }

    async deleteSelected() {
        if (this.mode !== "browser") return
        if (this.selectedRowIndex < 0) {
            this.setTableStatus("No row selected")
            return
        }
        await this.deleteRow(this.selectedRowIndex)
    }

    async deleteRow(rowIndex) {
        assert(this.selectedTable, "Cannot delete: no table selected")
        assert(this.primaryKey, "Cannot delete: no primary key column")

        const row = this.rows[rowIndex]
        const pkValue = row[this.primaryKey]
        assert(pkValue !== undefined && pkValue !== null && pkValue !== "", "Cannot delete: no primary key value")

        const confirmed = unwrap(
            await runtime.call("ui.toast.confirm", {
                message: `Delete row with ${this.primaryKey} = ${pkValue}?`,
                type: "warning",
                confirmText: "Delete",
                cancelText: "Cancel",
            }),
        )
        if (!confirmed) return

        try {
            await sql.exec(`DELETE FROM ${sqlIdent(this.selectedTable)} WHERE ${sqlIdent(this.primaryKey)} = ?`, [
                String(pkValue),
            ])
            this.setTableStatus("Row deleted")
            this.selectedRowIndex = -1
            await this.fetchTableData()
        } catch (error) {
            this.setTableStatus(`Delete error: ${error.message}`)
        }
    }

    handleKeyDown(event) {
        if (this.editingCell) return

        if (this.mode === "chooser" || this.mode === "saver") {
            if (event.key === "Enter") {
                event.preventDefault()
                void this.confirmSelection()
                return
            }

            return
        }

        if (event.key === "Insert") {
            event.preventDefault()
            void this.insertRow()
            return
        }

        if (
            (event.key === "Delete" && (event.ctrlKey || event.metaKey)) ||
            (event.key === "Backspace" && event.metaKey)
        ) {
            event.preventDefault()
            void this.deleteSelected()
            return
        }

        if (event.key === "Enter" && this.selectedRowIndex >= 0) {
            event.preventDefault()
            this.startEditAt(this.selectedRowIndex, 0)
        }
    }

    setTablesStatus(text) {
        if (this.tablesStatusContainer instanceof HTMLOutputElement) {
            this.tablesStatusContainer.textContent = text
        }
    }

    setTableStatus(text) {
        if (this.tableStatusContainer instanceof HTMLOutputElement) {
            this.tableStatusContainer.textContent = text
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue || !this.dataset.ready) return

        if (name === "data-page-size") {
            const parsed = parseInt(String(newValue || "20"), 10)
            this.pageSize = Number.isFinite(parsed) && parsed > 0 ? parsed : 20
            this.currentPage = 0
            void this.refresh()
            return
        }

        if (
            name === "data-mode" ||
            name === "data-query" ||
            name === "data-count-query" ||
            name === "data-confirm-label" ||
            name === "data-return-column" ||
            name === "data-return-fields"
        ) {
            this.currentPage = 0
            this.selectedRowIndex = -1
            void this.refresh()
        }
    }
}

if (!customElements.get("view-sql")) {
    customElements.define("view-sql", ViewSql)
}
