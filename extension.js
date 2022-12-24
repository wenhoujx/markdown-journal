const vscode = require('vscode');
const fs = require('fs')
const path = require('path')

// configs 
const configKey = 'markdown-journal'
const journalDir = 'journal-dir'
const toTomorrowTags = 'to-tomorrow-tags'
const defaultTags = 'default-tags'


const journalPrefix = 'journal'
const journalIntervalPrefix = 'journal-interval'
const isDebug = true

function _log(logString) {
	isDebug && console.log(logString)
}

function _loadConfig(context) {
	const extensionConfig = vscode.workspace.getConfiguration(configKey)
	return {
		journalDir: extensionConfig.get(journalDir) || context.globalStorageUri.fsPath,
		tomorrowTags: extensionConfig.get(toTomorrowTags) || ['todo'],
		tags: [...(extensionConfig.get(defaultTags) || []), 'todo']
	}
}

function _todayDate() {
	const d = new Date()
	const year = d.getFullYear()
	const month = (d.getMonth() + 1).toString().padStart(2, "0");
	const day = d.getDate().toString().padStart(2, "0");
	return {
		year, month, day
	}
}

function _computeNewTodayFileContent(config) {
	const d = new Date()
	let dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
	let content = [`# Journal ${d.getFullYear()} ${d.getMonth()} ${d.getDay()} ${dayOfWeek}`]
	content = content.concat(_yesterdayCarryOver(config))
	return content.join('\n')
}

function _yesterdayCarryOver(config) {
	const yesterday = new Date(Date.now() - 86400000)
	const fileName = _journalFileName({
		year: yesterday.getFullYear(),
		month: yesterday.getMonth() + 1,
		day: yesterday.getDate()
	})
	const content = _getJournalContent(_filePath(config.journalDir, fileName))
	if (!content) {
		return []
	}
	const lines = content.split(/\r?\n/)
	const taskLines = lines.flatMap((line, i) => _isTaskHeader(line) ? [i] : [])
	let filteredLine = []
	for (let i = 0; i < taskLines.length; i++) {
		if (hasIntersection(_getTaskTags(lines[taskLines[i]]), config.tomorrowTags)) {
			filteredLine = filteredLine.concat(
				lines.slice(taskLines[i],
					i === taskLines.length - 1 ?
						lines.length : taskLines[i + 1])
			)
		}
	}
	return filteredLine
}

function hasIntersection(aList, bList) {
	for (let a of aList) {
		for (let b of bList) {
			if (a === b) {
				return true
			}
		}
	}
	return false
}
function _journalFileName(t) {
	return `${journalPrefix}-${t.year}-${t.month}-${t.day}.md`
}

function _createTodayFileIfMissing(config) {
	const dir = config.journalDir
	const todayFile = _journalFileName(_todayDate())

	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	const filepath = _filePath(dir, todayFile)
	if (!fs.existsSync(filepath)) {
		fs.writeFileSync(filepath, _computeNewTodayFileContent(config))
	}
}


function _first(arr, defaultValue = null) {
	return arr.length ? arr[0] : defaultValue
}

function _filePath(dir, fileName) {
	return path.join(dir, fileName)
}

function journals(config) {
	// list all journals 
	_createTodayFileIfMissing(config)
	const journalFiles = fs.readdirSync(config.journalDir, { withFileTypes: true })
		.filter(item => !item.isDirectory())
		.filter(item => item.name.startsWith(journalPrefix))
		.map(item => item.name)
		.sort()
		// put today at the top 
		.reverse()
	const pick = vscode.window.createQuickPick()
	pick.items = journalFiles.map(jf => ({
		label: jf,
	}))
	pick.onDidAccept(async () => {
		const selected = _first(pick.selectedItems)
		if (!selected) {
			return
		}
		_log(`picked: ${JSON.stringify(selected)}`)
		_openAndShowFile(_filePath(config.journalDir, selected.label))
		pick.hide()
	})
	pick.show()
}

async function _openNewTextDocument(content) {
	const document = await vscode.workspace.openTextDocument({
		language: 'markdown',
		content
	});
	vscode.window.showTextDocument(document);

}

async function _openAndShowFile(filepath) {
	const doc = await vscode.workspace.openTextDocument(
		filepath
	);
	vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false);
}

function today(config) {
	const todayFileName = _journalFileName(_todayDate())
	const todayFilePath = _filePath(config.journalDir, todayFileName)
	_openAndShowFile(todayFilePath)
}

function refresh(config) {
	const todayFilePath = _filePath(config.journalDir, _journalFileName(_todayDate()))
	// parse the file without opening the file
	const content = _getJournalContent(todayFilePath)
	const computeTotalTimes = content.split(/\r?\n/).reduce((acc, line) => {
		if (_isTaskHeader(line)) {
			acc.push({
				line,
				total: 0
			})
		} else if (line.startsWith(journalIntervalPrefix)) {
			const m = /^journal-interval: (.+) - (.*)$/.exec(line)
			if (m[2] === 'Running') {
				acc[acc.length - 1].total += Date.now() - Date.parse(m[1]).valueOf()
			} else {
				acc[acc.length - 1].total += Date.parse(m[2]).valueOf() - Date.parse(m[1]).valueOf()
			}
		}
		return acc
	}, [])
	const formatted = computeTotalTimes.flatMap(({ line, total }) => [line, _msToString(total)])
	_openNewTextDocument(formatted.join("\n"))
}

function _msToString(ms) {
	const inSeconds = Math.floor(ms / 1000);
	const inMinutes = Math.floor(inSeconds / 60);
	const inHours = Math.floor(inMinutes / 60);

	const seconds = inSeconds % 60;
	const minutes = inMinutes % 60;
	let str = seconds + 's'
	if (minutes) {
		str = minutes + 'm' + str
	}
	if (inHours) {
		str = inHours + 'h' + str
	}
	return str
}

function addTag(config) {
	if (!isInJournal()) { return }
	const sel = vscode.window.activeTextEditor.selection
	if (!sel) { return }
	let lineNumber = sel.start.line
	const doc = vscode.window.activeTextEditor.document
	while (!_isTaskHeader(doc.lineAt(lineNumber).text) && lineNumber >= 0) {
		lineNumber--
	}
	if (lineNumber < 0) {
		// no task yet 
		return
	}
	// now we are on the line of task header
	const pick = vscode.window.createQuickPick()
	pick.canSelectMany = true
	pick.placeholder = 'select tags'
	pick.items = _getAllTags(doc.getText(), config.tags).map(tag => ({
		label: tag
	}))
	pick.onDidAccept(() => {
		const sel = _first(pick.selectedItems)
		if (!sel) { return }
		const tag = sel.label
		const newLineText = _addTaskTag(doc.lineAt(lineNumber).text, tag)
		_replaceLine(lineNumber, newLineText)
		pick.hide()
	})
	pick.show()
}

function _isTaskHeader(text) {
	return text.startsWith('## ')
}

function _getTaskTags(lineText) {
	const i = lineText.lastIndexOf('(:')
	if (i === -1) {
		return []
	} else {
		const tagString = lineText.slice(i + 2, lineText.lastIndexOf(':)'))
		return tagString.split(":").map(e => e.trim()).filter(e => e)
	}
}

function _addTaskTag(lineText, tag) {
	const i = lineText.lastIndexOf('(:')
	if (i === -1) {
		return `${lineText.trim()} (:${tag}:)`
	} else {
		const currentTags = _getTaskTags(lineText)
		if (currentTags.includes(tag)) {
			// do nothing 
			return lineText
		} else {
			const j = lineText.lastIndexOf(":")
			return `${lineText.slice(0, j).trim()}:${tag}:)`
		}
	}
}

function _unique(lst) {
	const map = {}
	lst.forEach(ll => map[ll] = ll)
	return Object.keys(map)
}

function _getAllTags(content, additionalTags) {
	return _unique(_getAllTaskHeaders(content).flatMap(line => _getTaskTags(line)).concat(additionalTags))
}

function _getAllTaskHeaders(content) {
	return content.split(/\r?\n/).map(line => {
		if (_isTaskHeader(line)) {
			return line
		} else {
			return null
		}
	})
		.filter(e => e)
}


function startTask(config) {
	const todayFilePath = _filePath(config.journalDir, _journalFileName(_todayDate()))
	// parse the file without opening the file
	const content = _getJournalContent(todayFilePath)
	const pick = vscode.window.createQuickPick()
	pick.placeholder = "pick a task to start"
	pick.items = _getAllTaskHeaders(content)
		.map(line => ({
			label: line
		}))
	pick.onDidAccept(() => {
		const sel = _first(pick.selectedItems)
		if (!sel) { return }
		const newContent = _startTimingTask(_stopAllTasks(content), sel.label)
		_writeFile(todayFilePath, newContent)
		pick.hide()
	})
	pick.show()
}

function _writeFile(filepath, content) {
	fs.writeFileSync(filepath, content)
}

function _startTimingTask(content, taskTitle) {
	const now = new Date().toISOString()
	return content.split("\n").flatMap(line => {
		if (line === taskTitle) {
			return [line, `${journalIntervalPrefix}: ${now} - Running`]
		} else {
			return [line]
		}
	})
		.join('\n')
}

function _stopAllTasks(content) {
	const now = new Date().toISOString()
	return content.split(/\r?\n/)
		.map(line => {
			if (line.startsWith(journalIntervalPrefix) && line.endsWith('Running')) {
				const m = /^journal-interval: (.+) - (.*)$/.exec(line)
				if (m && (m[2] === 'Running')) {
					return `${journalIntervalPrefix}: ${m[1]} - ${now}`
				} else {
					return line
				}
			} else {
				return line
			}
		})
		.join('\n')
}

function _insertLine(lineNumber, lineText) {
	const editor = vscode.window.activeTextEditor
	editor.edit(builder => {
		builder.insert(new vscode.Position(lineNumber, 0), lineText)
	})
}

function _findLineNumber(doc, line) {
	return [...new Array(doc.lineCount)].find((e, i) => {
		return doc.lineAt(i) === line
	})
}

function _getJournalContent(filepath) {
	if (fs.existsSync(filepath)) {
		return fs.readFileSync(filepath, 'utf8')
	} else {
		return null
	}

}

function _replaceLine(lineNumber, newLineText) {
	const editor = vscode.window.activeTextEditor
	editor.edit(builder => {
		builder.replace(new vscode.Range(
			new vscode.Position(lineNumber, 0),
			new vscode.Position(lineNumber, editor.document.lineAt(lineNumber).text.length)
		), newLineText)
	})
}

function stopTask(config) {
	const todayFilePath = _filePath(config.journalDir, _journalFileName(_todayDate()))
	// parse the file without opening the file
	const content = _getJournalContent(todayFilePath)
	_writeFile(todayFilePath, _stopAllTasks(content))
}

function isInJournal() {
	const fn = vscode.window.activeTextEditor.document.fileName
	if (!fn) {
		return false
	}
	return /journal-(.*).md/.test(fn)
}

function activate(context) {
	const config = _loadConfig(context)
	_createTodayFileIfMissing(config)

	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.today', () => today(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.journals', () => journals(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.refresh', () => refresh(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.add-tag', () => addTag(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.start-task', () => startTask(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.stop-task', () => stopTask(config)));
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
