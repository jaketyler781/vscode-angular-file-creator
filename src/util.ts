import * as vscode from 'vscode';

export async function runWithErrorLogging(runCommand: () => Promise<void>): Promise<void> {
    try {
        await runCommand();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.toString() : error;
        if (typeof message === 'string') {
            vscode.window.showErrorMessage(message);
        }
        console.error(message);
    }
}
