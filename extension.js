const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('The extension "completion-streamer" is active');

	let setUriCommand = vscode.commands.registerCommand('completion-streamer.setUri', function () {
		vscode.window.showInputBox({
			prompt: 'Enter your ollama URI (default: http://127.0.0.1:11434)'
		}).then((uri) => {

			// If the user didn't enter a URI, use the default
			if (!uri) {
				uri = 'http://127.0.0.1:11434';
			}

			// Save the URI to the configuration to vscode settings.json
			context.globalState.update('completionStreamerOllamaUri', uri);
			vscode.window.showInformationMessage(`Completion streamer ollama URI set to ${uri}`);
		});
	});

	let setModelNameCommand = vscode.commands.registerCommand('completion-streamer.setModelName', function () {
		vscode.window.showInputBox({
			prompt: 'Enter your ollama model name (default: starcoder:1b)'
		}).then((modelName) => {

			// If the user didn't enter a URI, use the default
			if (!modelName) {
				modelName = 'starcoder:1b';
			}

			// Save the URI to the configuration to vscode settings.json
			context.globalState.update('completionStreamerModelName', modelName);
			vscode.window.showInformationMessage(`Completion streamer model name set to ${modelName}`);
		});
	});

	let triggerCompletionCommand = vscode.commands.registerCommand('completion-streamer.triggerCompletion', function () {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const position = editor.selection.active;
			const textBeforeCursor = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), position));
			const textAfterCursor = editor.document.getText(new vscode.Range(position, new vscode.Position(editor.document.lineCount, 0)));

			// Now let's build the string using textBeforeCursor and textAfterCursor and the template
			let fillInTheMiddleTemplate = "<fim_prefix>" + textBeforeCursor + "<fim_suffix>" + textAfterCursor + "<fim_middle>";

			let ollamaUri = context.globalState.get('completionStreamerOllamaUri');

			// If the URI is not set, tell the user
			if (!ollamaUri) {
				vscode.window.showInformationMessage('Please set the Ollama URI first. ');
				return;
			}

			let modelName = context.globalState.get('completionStreamerModelName');

			// If the URI is not set, tell the user
			if (!modelName) {
				vscode.window.showInformationMessage('Please set the ollama model name first. ');
				return;
			}

			// Send a request with the text before the cursor
			getCompletionFim(fillInTheMiddleTemplate, ollamaUri, modelName);
		}
	});

	

	context.subscriptions.push(setUriCommand);
	context.subscriptions.push(triggerCompletionCommand);
}

let messageQueue = [];
let isProcessing = false;

function processNextMessage() {
	if (messageQueue.length === 0) {
		isProcessing = false;
		return;
	}

	isProcessing = true;
	const message = messageQueue.shift();
	writeSuggestion(message).then(() => {
		processNextMessage();
	});
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeSuggestion(suggestion, sleepTime) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    let position = editor.selection.active;

    for (let i = 0; i < suggestion.length; i++) {
        await editor.edit(editBuilder => {
            editBuilder.insert(position, suggestion[i]);
        });

        // Calculate the new cursor position
        if (suggestion[i] === '\n') {
            position = new vscode.Position(position.line + 1, 0);
        } else {
            position = position.translate(0, 1);
        }
        editor.selection = new vscode.Selection(position, position);

        // // Sleep for the defined time
		// let sleepTimeMin = 80;
		// let sleepTimeMax = 200;
		// let randomSleepTimeMs = Math.floor(Math.random() * (sleepTimeMax - sleepTimeMin + 1) + sleepTimeMin);
        // await sleep(randomSleepTimeMs);
    }
}

async function getCompletionFim(completionString, ollamaUri, modelName) {
	
	let payload = {
		model: modelName,
		prompt: completionString
		// options: {
		// 	num_predict: 10
		// }
	}

	if (ollamaUri.endsWith("/")) {
		ollamaUri = ollamaUri.slice(0, -1);
	}
	let postUrl = ollamaUri + "/api/generate?stream=true"

	const response = await fetch(postUrl, {
		method: 'POST',
		body: JSON.stringify(payload)
	});
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

	while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
            const chunk = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 1);
            
            if (chunk.trim()) {
                try {
                    const json = JSON.parse(chunk);
					// check if "response" exists in json
					if (json.response) {
						messageQueue.push(json.response + "");
						if (!isProcessing) {
							processNextMessage();
						}
                    }
                } catch (e) {
                    console.error('Error parsing JSON:', e);
                }
            }
            
            boundary = buffer.indexOf('\n');
        }
    }
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
