import {TextDecoder} from 'util';
import * as vscode from 'vscode';
import * as path from 'path';

export async function doesFileExist(filePath: string): Promise<boolean> {
    try {
        const uri = vscode.Uri.parse(filePath);
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

/**
 * Reads a file in any of the current workspace folders.
 * Works for reading templates based on paths from the extension's settings
 * as well as for files relative to other files.
 */
export async function readFile(filePath: string | vscode.Uri): Promise<string> {
    const workspaceRootFolders = vscode.workspace.workspaceFolders ?? [];
    const fileTemplateAbsoluteUris = workspaceRootFolders.map((workspaceRootFolder) =>
        path.resolve(workspaceRootFolder.uri.fsPath, typeof filePath === 'string' ? filePath : filePath.fsPath),
    );
    const fileTemplateAbsoluteUri = fileTemplateAbsoluteUris[0];
    const fileBytes = await vscode.workspace.fs.readFile(vscode.Uri.file(fileTemplateAbsoluteUri));
    const fileContents: string = new TextDecoder().decode(fileBytes);
    return fileContents;
}

export async function assertFolder(uri: vscode.Uri): Promise<void> {
    const fileStat = await vscode.workspace.fs.stat(uri);
    if (fileStat.type !== vscode.FileType.Directory) {
        throw new Error('Must select a folder for creating new Angular files');
    }
}
