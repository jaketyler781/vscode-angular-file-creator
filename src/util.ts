import * as vscode from 'vscode';

export async function runWithErrorLogging(runCommand: () => Promise<void>): Promise<void> {
    try {
        await runCommand();
    } catch (err) {
        vscode.window.showErrorMessage(err.toString());
        console.error(err);
    }
}
