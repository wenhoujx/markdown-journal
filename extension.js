const vscode = require('vscode');
const fs = require('fs')
const path = require('path');

// configs 
const configKey = 'markdown-journal'
const journalDir = 'journal-dir'
const toTomorrowTags = 'to-tomorrow-tags'
const defaultTags = 'default-tags'


const journalPrefix = 'journal'
const journalIntervalPrefix = 'journal-interval'
const isDebug = true

function _journalIntervalRegex() {
	return /^- journal-interval: (.+) - (.*)$/
}

function _parseJournalInterval(line) {
	if (line.startsWith(`- ${journalIntervalPrefix}`)) {
		const m = _journalIntervalRegex().exec(line)
		if (!m) {
			return null
		} else {
			return { start: m[1], end: m[2] }
		}
	} else {
		return null
	}
}

function _newInterval() {
	const now = new Date().toLocaleString()
	return `- ${journalIntervalPrefix}: ${now} - Running`
}

function _tryStopInterval(line) {
	const now = new Date().toLocaleString()
	const parsed = _parseJournalInterval(line)
	if (!parsed) {
		return line
	} else {
		return `- ${journalIntervalPrefix}: ${parsed.start} - ${now}`
	}
}

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
	let content = [`# Journal ${d.getFullYear()} ${d.getMonth() + 1} ${d.getDate()} ${dayOfWeek}`]
	content = content.concat(_previousCarryOver(config))
	return content.join('\n')
}

function _splitLinesByTask(content) {
	if (!content) {
		return []
	}
	const lines = content.split(/\r?\n/)
	const taskLines = lines.flatMap((line, i) => _isTaskHeader(line) ? [i] : [])
	const tasks = []
	for (let i = 0; i < taskLines.length; i++) {
		tasks.push(lines.slice(taskLines[i],
			i === taskLines.length - 1 ?
				lines.length : taskLines[i + 1]))
	}
	return {
		header: taskLines.length ? lines.slice(0, taskLines[0]) : lines,
		tasks
	}
}

function _previousCarryOver(config) {
	// compute latest previous content that should be moved over to todays.
	// return array of lines
	const latestJournal = _first(_getAllJournals(config))
	if (!latestJournal) {
		return []
	} else {
		const content = _getJournalContent(_filePath(config.journalDir, latestJournal))
		const { tasks } = _splitLinesByTask(content)
		return tasks.filter(task => _hasIntersection(_getTaskTags(task[0]), config.tomorrowTags))
			.flatMap(t => t)
	}
}

function _hasIntersection(aList, bList) {
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

function _getAllJournals(config) {
	// return all journal files sorted with latest first. 
	return fs.readdirSync(config.journalDir, { withFileTypes: true })
		.filter(item => !item.isDirectory())
		.filter(item => item.name.startsWith(journalPrefix))
		.map(item => item.name)
		.sort()
		// put today at the top 
		.reverse()
}
function journals(config) {
	// list all journals 
	_createTodayFileIfMissing(config)
	const journalFiles = _getAllJournals(config)
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

function _todayEarliestDate() {
	const d = new Date()
	d.setHours(0)
	d.setMinutes(0)
	d.setSeconds(0)
	return d
}
function computeTimes(config) {
	const todayFilePath = _filePath(config.journalDir, _journalFileName(_todayDate()))
	// parse the file without opening the file
	const content = _getJournalContent(todayFilePath)
	const { header, tasks } = _splitLinesByTask(content)
	const processTasks = tasks.map(task => {
		const time = task.map(line => {
			const m = _parseJournalInterval(line)
			if (!m) {
				return 0
			} else {
				const { start, end } = m
				const startD = Date.parse(start)
				const endD = end === 'Running' ? Date.now() : Date.parse(end).valueOf()
				const todayStart = _todayEarliestDate()
				if (todayStart.valueOf() > endD.valueOf()) {
					return 0
				} else {
					return (endD.valueOf()) - (
						startD.valueOf() < todayStart.valueOf() ? todayStart.valueOf() : startD.valueOf()
					)
				}
			}
		}).reduce((acc, ele) => acc + ele, 0)
		return {
			task: task[0],
			tags: _getTaskTags(task[0]),
			time
		}
	})

	const timeByTag = {}
	for (const t of processTasks) {
		for (const tag of t.tags) {
			timeByTag[tag] = ((tag in timeByTag) ? timeByTag[tag] : 0) + t.time
		}
	}

	const lines = ['By tasks', ""].concat(
		// remove the prefix '## '
		processTasks.map(t => `- ${t.task.slice(3)}: ${_msToString(t.time)}`))
		.concat(['By tags', ""])
		.concat(
			Object.entries(timeByTag).map(([tag, time]) => `- ${tag}: ${_msToString(time)}`)
		)
	_openNewTextDocument(lines.join("\n"))
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
	pick.placeholder = 'select tags'
	pick.matchOnDescription = true
	pick.items = [{ label: '', description: 'new tag' }].concat(_getAllTags(doc.getText(), config.tags).map(tag => ({
		label: tag
	})))
	pick.onDidChangeValue(val => {
		const updated = val.replaceAll(" ", "-").replaceAll(":", "-")
		const items = pick.items
		items[0] = { label: updated, description: 'new tag' }
		pick.items = items
	})
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

function _getTaskTags(taskHeader) {
	const i = taskHeader.lastIndexOf('(:')
	if (i === -1) {
		return []
	} else {
		const tagString = taskHeader.slice(i + 2, taskHeader.lastIndexOf(':)'))
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
	return _unique(
		_splitLinesByTask(content)
			.tasks
			.flatMap(task => _getTaskTags(task[0]))
			.concat(additionalTags)

	)
}
function _runningTask(content) {
	const tasks = _splitLinesByTask(content).tasks
	const task = tasks.find(t => {
		for (let line of t) {
			const m = _parseJournalInterval(line)
			if (m && (m.end === 'Running')) {
				return true
			}
		}
		return false
	})
	return task ? task[0] : null
}

function startTask(config) {
	const todayFilePath = _filePath(config.journalDir, _journalFileName(_todayDate()))
	// parse the file without opening the file
	const content = _getJournalContent(todayFilePath)
	const pick = vscode.window.createQuickPick()
	pick.placeholder = "pick a task to start"
	pick.items = _splitLinesByTask(content).tasks.map(task => task[0]).map(line => ({
		label: line
	}))

	pick.onDidAccept(() => {
		const sel = _first(pick.selectedItems)
		if (!sel) { return }
		const runningTask = _runningTask(content)
		if (runningTask !== sel.label) {
			// stop all tasks, only one task can be running, multi-tasking is forbidden. 
			const newContent = _startTimingTask(_stopAllTasks(content), sel.label)
			_writeFile(todayFilePath, newContent)

		}
		pick.hide()
	})
	pick.show()
}

function _writeFile(filepath, content) {
	fs.writeFileSync(filepath, content)
}


function _startTimingTask(content, taskTitle) {
	const { header, tasks } = _splitLinesByTask(content)
	const lines = tasks.flatMap(task => {
		if (task[0] !== taskTitle) {
			return task
		} else {
			const intervalsIndex = task.findIndex(line => _parseJournalInterval(line))
			if (intervalsIndex === -1) {
				// first interval 
				task.splice(1, 0, _newInterval())
			} else {
				// put new interval before all other intervals 
				task.splice(intervalsIndex, 0, _newInterval())
			}
			return task
		}
	})
	return (header.concat(lines)).join('\n')
}

function _stopAllTasks(content) {
	return content.split(/\r?\n/)
		.map(line => {
			const parsed = _parseJournalInterval(line)
			if (!parsed) {
				return line
			} else {
				return _tryStopInterval(line)
			}
		}).join('\n')
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
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.compute-times', () => computeTimes(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.add-tag', () => addTag(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.start-task', () => startTask(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.stop-task', () => stopTask(config)));
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
