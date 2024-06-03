import * as vscode from 'vscode';

export async function doesFileExist(filePath: string): Promise<boolean> {
    try {
        const uri = vscode.Uri.parse(filePath);
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

export async function assertFolder(uri: vscode.Uri): Promise<void> {
    const fileStat = await vscode.workspace.fs.stat(uri);
    if (fileStat.type !== vscode.FileType.Directory) {
        throw new Error('Must select a folder for creating new Angular files');
    }
}
