import * as vscode from 'vscode';
import * as path from 'path';
import {TextDecoder, TextEncoder} from 'util';

export class File {
    public static async exists(path: string | vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(this.asUri(path));
            return true;
        } catch {
            return false;
        }
    }

    public static async write(uri: vscode.Uri, content: string): Promise<File> {
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
        return new File(uri);
    }

    public readonly uri: vscode.Uri;

    /**
     * @param filePath a string or Uri pointing at a file. The file should exist.
     * If you already have a Uri, you can use that.
     * If you don't have a Uri (e.g. a file path from a config setting),
     * do not create a Uri, as you might need to resolve the file path relative to the workspace,
     * which this constructor will do for you.
     */
    constructor(filePath: string | vscode.Uri) {
        if (typeof filePath === 'string') {
            const workspaceRootFolders = vscode.workspace.workspaceFolders ?? [];
            const fileAbsoluteUri = workspaceRootFolders.map((workspaceRootFolder) =>
                path.resolve(workspaceRootFolder.uri.fsPath, filePath),
            )[0];
            if (!fileAbsoluteUri) {
                throw new Error(`Failed to resolve path to file: ${filePath}`);
            }
            this.uri = vscode.Uri.file(fileAbsoluteUri);
        } else {
            this.uri = filePath;
        }
    }

    public get baseName(): string {
        return path.basename(this.uri.fsPath);
    }

    /**
     * Reads a file in any of the current workspace folders.
     * Works for reading templates based on paths from the extension's settings
     * as well as for files relative to other files.
     */
    public async read(): Promise<string> {
        if (this.contents) {
            return this.contents;
        }
        return (this.contents = vscode.workspace.fs
            .readFile(this.uri)
            .then((fileBytes): string => new TextDecoder().decode(fileBytes)));
    }
    private contents?: PromiseLike<string>;

    public async show(): Promise<void> {
        const document = await vscode.workspace.openTextDocument(this.uri);
        await vscode.window.showTextDocument(document, {preview: false});
    }

    private static asUri(filePath: string | vscode.Uri): vscode.Uri {
        return typeof filePath === 'string' ? vscode.Uri.file(filePath) : filePath;
    }

    public static inWorkspace(filePath: string): boolean {
        const workspaceRootFolders = vscode.workspace.workspaceFolders ?? [];
        return workspaceRootFolders.some(
            (workspaceRootFolder) => path.relative(workspaceRootFolder.uri.fsPath, filePath).substring(0, 2) !== '..',
        );
    }
}

export async function assertFolder(uri: vscode.Uri): Promise<void> {
    const fileStat = await vscode.workspace.fs.stat(uri);
    if (fileStat.type !== vscode.FileType.Directory) {
        throw new Error('Must select a folder for creating new Angular files');
    }
}
