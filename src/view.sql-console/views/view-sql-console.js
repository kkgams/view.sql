import { registerViewPlugin, unregisterViewPlugin } from "/util/view-plugin.js"
import { sql as sqlConnection } from "/util/sql.js"
import "/widgets/code-editor.js"

function firstSqlToken(sql) {
    let index = 0
    while (index < sql.length) {
        const char = sql[index]
        const next = sql[index + 1]
        if (/\s/.test(char)) {
            index++
            continue
        }
        if (char === "-" && next === "-") {
            index += 2
            while (index < sql.length && sql[index] !== "\n") index++
            continue
        }
        if (char === "/" && next === "*") {
            index += 2
            while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) index++
            if (index >= sql.length) throw new Error("Unterminated SQL block comment")
            index += 2
            continue
        }
        const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(index))
        return match ? match[0].toUpperCase() : ""
    }
    return ""
}

function isQueryStatement(sql) {
    const token = firstSqlToken(String(sql || ""))
    return token === "SELECT" || token === "PRAGMA" || token === "EXPLAIN" || token === "WITH" || token === "VALUES"
}

function splitSqlStatements(sql) {
    const source = String(sql || "")
    const statements = []
    let start = 0
    let index = 0
    let state = "normal"

    while (index < source.length) {
        const char = source[index]
        const next = source[index + 1]

        if (state === "normal") {
            if (char === ";") {
                const statement = source.slice(start, index).trim()
                if (statement) statements.push(statement)
                start = index + 1
                index++
                continue
            }
            if (char === "'") {
                state = "single"
            } else if (char === '"') {
                state = "double"
            } else if (char === "`") {
                state = "backtick"
            } else if (char === "[") {
                state = "bracket"
            } else if (char === "-" && next === "-") {
                state = "line-comment"
                index++
            } else if (char === "/" && next === "*") {
                state = "block-comment"
                index++
            }
            index++
            continue
        }

        if (state === "single") {
            if (char === "'" && next === "'") {
                index += 2
                continue
            }
            if (char === "'") state = "normal"
            index++
            continue
        }

        if (state === "double") {
            if (char === '"' && next === '"') {
                index += 2
                continue
            }
            if (char === '"') state = "normal"
            index++
            continue
        }

        if (state === "backtick") {
            if (char === "`") state = "normal"
            index++
            continue
        }

        if (state === "bracket") {
            if (char === "]") state = "normal"
            index++
            continue
        }

        if (state === "line-comment") {
            if (char === "\n") state = "normal"
            index++
            continue
        }

        if (state === "block-comment") {
            if (char === "*" && next === "/") {
                state = "normal"
                index += 2
                continue
            }
            index++
            continue
        }
    }

    if (state === "single") throw new Error("Unterminated SQL single-quoted string")
    if (state === "double") throw new Error("Unterminated SQL double-quoted identifier")
    if (state === "backtick") throw new Error("Unterminated SQL backtick-quoted identifier")
    if (state === "bracket") throw new Error("Unterminated SQL bracket-quoted identifier")
    if (state === "block-comment") throw new Error("Unterminated SQL block comment")

    const statement = source.slice(start).trim()
    if (statement) statements.push(statement)
    return statements
}

function formatQueryResultAsTable(result) {
    const { columns, rows } = result
    if (columns.length === 0) return "(0 rows)"

    const columnWidths = columns.map((column) => String(column).length)
    for (const row of rows) {
        columns.forEach((column, index) => {
            columnWidths[index] = Math.max(columnWidths[index], String(row[column] ?? "").length)
        })
    }

    const separator = `+${columnWidths.map((width) => "-".repeat(width + 2)).join("+")}+`
    const lines = [separator, `| ${columns.map((column, index) => String(column).padEnd(columnWidths[index])).join(" | ")} |`, separator]

    for (const row of rows) {
        lines.push(`| ${columns.map((column, index) => String(row[column] ?? "").padEnd(columnWidths[index])).join(" | ")} |`)
    }

    if (rows.length > 0) lines.push(separator)
    lines.push(`(${rows.length} row${rows.length === 1 ? "" : "s"})`)
    return lines.join("\n")
}

export class ViewSqlConsole extends HTMLElement {
    constructor() {
        super()
        this.history = []
        this.historyIndex = -1
        this.outputElement = null
        this.formElement = null
        this.inputElement = null
        this.runButton = null
        this.statusElement = null
    }

    connectedCallback() {
        registerViewPlugin(this)
        if (this.dataset.ready) return
        this.dataset.ready = "1"

        this.style.display = "contents"
        this.setAttribute("tabindex", "0")

        this.innerHTML = `
      <article>
        <pre data-element="output"></pre>
      </article>
      <footer>
        <form data-element="form">
          <code-editor data-field="query" placeholder="SELECT * FROM sqlite_schema;" rows="3"></code-editor>
          <button type="submit" class="accent">Run</button>
          <output data-element="status"></output>
        </form>
      </footer>
    `

        this.outputElement = this.querySelector('[data-element="output"]')
        this.formElement = this.querySelector('[data-element="form"]')
        this.inputElement = this.querySelector('[data-field="query"]')
        this.runButton = this.querySelector('button[type="submit"]')
        this.statusElement = this.querySelector('[data-element="status"]')

        this.formElement?.addEventListener("submit", async (event) => {
            event.preventDefault()
            const sql = this.inputElement?.value.trim() || ""
            if (!sql) return
            await this.executeQuery(sql)
            this.history.push(sql)
            this.historyIndex = this.history.length
            if (this.inputElement) {
                this.inputElement.value = ""
            }
        })

        this.inputElement?.addEventListener("keydown", (event) => this.handleInputKeyDown(event))

        this.appendOutput("info", "SQL Console Ready. Type SQL queries and press Run or Enter.")
        this.appendOutput("info", "Use Shift+Enter for multi-line input.")

        queueMicrotask(() => this.inputElement?.focus())
    }

    handleInputKeyDown(event) {
        if (!this.inputElement) return

        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            this.formElement?.requestSubmit()
            return
        }

        const textarea = this.inputElement.querySelector("textarea")
        if (!textarea) return

        if (event.key === "ArrowUp" && !event.shiftKey) {
            const { selectionStart, selectionEnd } = textarea
            if (selectionStart === 0 && selectionEnd === 0 && this.historyIndex > 0) {
                event.preventDefault()
                this.historyIndex--
                this.inputElement.value = this.history[this.historyIndex] || ""
                queueMicrotask(() => {
                    const nextTextarea = this.inputElement?.querySelector("textarea")
                    if (!nextTextarea) return
                    nextTextarea.selectionStart = nextTextarea.selectionEnd = nextTextarea.value.length
                })
            }
            return
        }

        if (event.key === "ArrowDown" && !event.shiftKey) {
            const { selectionStart, selectionEnd, value } = textarea
            if (selectionStart === value.length && selectionEnd === value.length) {
                event.preventDefault()
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++
                    this.inputElement.value = this.history[this.historyIndex] || ""
                } else {
                    this.historyIndex = this.history.length
                    this.inputElement.value = ""
                }
                queueMicrotask(() => {
                    const nextTextarea = this.inputElement?.querySelector("textarea")
                    if (!nextTextarea) return
                    nextTextarea.selectionStart = nextTextarea.selectionEnd = nextTextarea.value.length
                })
            }
        }
    }

    async executeQuery(sql) {
        this.appendOutput("command", sql)
        this.setStatus("Running...", "info")
        if (this.runButton) this.runButton.disabled = true

        try {
            const statements = splitSqlStatements(sql)
            for (const [index, statement] of statements.entries()) {
                if (statements.length > 1) {
                    this.appendOutput("info", `Statement ${index + 1}/${statements.length}`)
                }
                if (isQueryStatement(statement)) {
                    const result = await sqlConnection.queryRows(statement)
                    this.appendOutput("result", formatQueryResultAsTable(result))
                } else {
                    const changes = await sqlConnection.exec(statement)
                    this.appendOutput("success", `${changes} row${changes === 1 ? "" : "s"} changed`)
                }
            }
            this.setStatus(`${statements.length} statement${statements.length === 1 ? "" : "s"} finished`, "success")
        } catch (error) {
            this.appendOutput("error", error?.message || String(error))
            this.setStatus(`Error: ${error?.message || error}`, "danger")
            console.error("view-sql-console query failed:", error)
        } finally {
            if (this.runButton) this.runButton.disabled = false
        }
    }

    appendOutput(type, content) {
        if (!this.outputElement) return

        const tone = type === "command" ? "accent" : type === "success" ? "success" : type === "error" ? "danger" : type === "info" ? "info" : null

        if (this.outputElement.childElementCount > 0) {
            const spacer = document.createElement("span")
            spacer.dataset.element = "output-spacer"
            spacer.textContent = ""
            this.outputElement.appendChild(spacer)
        }

        const line = document.createElement("span")
        line.dataset.element = "output-line"
        if (tone) {
            line.classList.add(tone)
        }

        const prefix = type === "command" ? "> " : type === "error" ? "ERROR: " : ""
        line.textContent = `${prefix}${content}`
        this.outputElement.appendChild(line)
        this.outputElement.scrollTop = this.outputElement.scrollHeight
    }

    setStatus(text, tone = null) {
        if (!this.statusElement) return
        this.statusElement.textContent = text
        this.statusElement.classList.remove("accent", "success", "warning", "danger", "info")
        if (tone) {
            this.statusElement.classList.add(tone)
        }
    }

    disconnectedCallback() {
        void unregisterViewPlugin(this)
    }
}

if (!customElements.get("view-sql-console")) {
    customElements.define("view-sql-console", ViewSqlConsole)
}
