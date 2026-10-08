import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

const VIEW_ID = 'showImageView'
const CONFIG_SECTION = 'show-image'
const DEFAULT_IMAGE = path.join('resources', 'img', 'test.jpg')

export async function activate(context: vscode.ExtensionContext) {
	const provider = new ShowImageViewProvider(context.extensionUri)

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(VIEW_ID, provider),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(`${CONFIG_SECTION}.imagePath`)) {
				provider.refresh()
			}
		}),
		vscode.commands.registerCommand('show-image.selectImage', async () => {
			const selected = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: 'Seleccionar imagen',
				filters: {
					Imágenes: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
				}
			})

			if (!selected?.[0]) {
				return
			}

			const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
			await config.update('imagePath', selected[0].fsPath, vscode.ConfigurationTarget.Global)
			vscode.window.showInformationMessage('Imagen actualizada en el sidebar')
		}),
		vscode.commands.registerCommand('show-image.refresh', () => {
			provider.refresh()
		})
	)

	if (!context.globalState.get<boolean>('show-image.initialViewShown', false)) {
		try {
			await vscode.commands.executeCommand(`${VIEW_ID}.focus`)
			await context.globalState.update('show-image.initialViewShown', true)
		} catch (error) {
			console.error('No se pudo abrir la vista Imagen automáticamente:', error)
		}
	}
}

class ShowImageViewProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView

	constructor(private readonly extensionUri: vscode.Uri) {}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this._view = webviewView

		webviewView.webview.options = {
			enableScripts: false,
			localResourceRoots: this.getLocalResourceRoots()
		}

		webviewView.webview.html = this.getHtml(webviewView.webview)
	}

	refresh(): void {
		if (!this._view) {
			return
		}

		this._view.webview.options = {
			...this._view.webview.options,
			localResourceRoots: this.getLocalResourceRoots()
		}
		this._view.webview.html = this.getHtml(this._view.webview)
	}

	private getLocalResourceRoots(): vscode.Uri[] {
		const roots = [this.extensionUri]
		const imagePath = this.getConfiguredImagePath()

		if (imagePath && fs.existsSync(imagePath)) {
			roots.push(vscode.Uri.file(path.dirname(imagePath)))
		}

		return roots
	}

	private getConfiguredImagePath(): string {
		return vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('imagePath', '').trim()
	}

	private resolveImageUri(webview: vscode.Webview): { src?: string, error?: string } {
		const configuredPath = this.getConfiguredImagePath()

		if (!configuredPath) {
			const defaultUri = vscode.Uri.joinPath(this.extensionUri, ...DEFAULT_IMAGE.split('/'))
			return { src: webview.asWebviewUri(defaultUri).toString() }
		}

		if (!fs.existsSync(configuredPath)) {
			return { error: `No se encontró la imagen:\n${configuredPath}` }
		}

		const fileUri = vscode.Uri.file(configuredPath)
		return { src: webview.asWebviewUri(fileUri).toString() }
	}

	private getHtml(webview: vscode.Webview): string {
		const { src, error } = this.resolveImageUri(webview)
		const nonce = getNonce()

		if (error) {
			return `<!DOCTYPE html>
<html lang="es">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style nonce="${nonce}">
		body {
			margin: 0;
			padding: 16px;
			font-family: var(--vscode-font-family);
			color: var(--vscode-errorForeground);
			background: var(--vscode-sideBar-background);
		}
		p { margin: 0; white-space: pre-wrap; word-break: break-word; }
	</style>
</head>
<body>
	<p>${escapeHtml(error)}</p>
</body>
</html>`
		}

		return `<!DOCTYPE html>
<html lang="es">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style nonce="${nonce}">
		* { box-sizing: border-box; }
		body {
			margin: 0;
			padding: 8px;
			background: var(--vscode-sideBar-background);
			overflow: auto;
		}
		.container {
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 100%;
		}
		img {
			display: block;
			max-width: 100%;
			height: auto;
			border-radius: 4px;
		}
	</style>
</head>
<body>
	<div class="container">
		<img src="${src}" alt="Imagen del sidebar" />
	</div>
</body>
</html>`
	}
}

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	let nonce = ''
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return nonce
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

export function deactivate() {}
