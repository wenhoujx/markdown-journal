const vscode = require('vscode');
const fs = require('fs')
const path = require('path')

const configKey = 'markdown-journal'
const journalDir = 'journal-dir'
const toTomorrowTags = 'to-tomorrow-tags'

function _loadConfig(context) {
	const extensionConfig = vscode.workspace.getConfiguration(configKey)
	return {
		journalDir: extensionConfig.get(journalDir),
		tomorrowTags: extensionConfig.get(toTomorrowTags)
	}
}

function _today() {
	const d = new Date()
	const year = d.getFullYear()
	const month = (d.getMonth() + 1).toString().padStart(2, "0");
	const day = d.getDate().toString().padStart(2, "0");
	let dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];

	return {
		year, month, day, dayOfWeek
	}
}

function _createTodayFile(dir) {
	const t = _today()
	const todayFile = `journal-${t.year}-${t.month}-${t.day}`

	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	const filepath = path.join(dir, todayFile)
	if (!fs.existsSync(filepath)) {
		const newFileContent = `# Journal ${d.year} ${d.month} ${d.day} ${d.dayOfWeek}`
		fs.writeFileSync() 
	}
}


function today(config) {

}
function refresh(config) {

}
function addTag(config) {

}
function activate(context) {
	const config = _loadConfig(context)

	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.today', () => today(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.refresh', () => refresh(config)));
	context.subscriptions.push(vscode.commands.registerCommand('markdown-journal.add-tag', () => addTag(config)));
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
