import * as vscode from 'vscode';

export async function runWithErrorLogging(
    runCommand: (uri: vscode.Uri) => Promise<void>,
    uri: vscode.Uri,
): Promise<void> {
    try {
        await runCommand(uri);
    } catch (err) {
        vscode.window.showErrorMessage(err.toString());
        console.error(err);
    }
}
