import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {AngularFileType} from './naming';

export async function doesFileExist(filePath: string): Promise<boolean> {
    try {
        const uri = vscode.Uri.parse(filePath);
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

export async function writeFile(path: string, content: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        fs.writeFile(path, content, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export async function findModules(inDirectory: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        fs.readdir(inDirectory, (err, items) => {
            if (err) {
                reject(err);
            } else {
                const result = items
                    .filter((item) => item.indexOf('.module.ts') !== -1)
                    .map((item) => path.join(inDirectory, item));

                const next = path.join(inDirectory, '..');

                const doNext = (vscode.workspace.workspaceFolders || []).some((folder) => {
                    return path.relative(folder.uri.fsPath, next).substr(0, 2) !== '..';
                });

                if (doNext) {
                    findModules(next).then((moreModules) => {
                        resolve(result.concat(moreModules));
                    }, reject);
                } else {
                    resolve(result);
                }
            }
        });
    });
}

export function ensureDot(relativePath: string): string {
    if (relativePath[0] === '.') {
        return relativePath;
    } else {
        return './' + relativePath;
    }
}

export async function makeFolder(folder: string) {
    return new Promise<void>((resolve, reject) => {
        fs.mkdir(folder, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export async function assertFolder(uri: vscode.Uri): Promise<void> {
    const fileStat = await vscode.workspace.fs.stat(uri);
    if (fileStat.type !== vscode.FileType.Directory) {
        throw new Error('Must select a folder for creating new Angular files');
    }
}

export function getAngularFileType(filename: string): AngularFileType | undefined {
    if (filename.endsWith('.component.ts')) {
        return AngularFileType.Component;
    } else if (filename.endsWith('.directive.ts')) {
        return AngularFileType.Directive;
    } else if (filename.endsWith('.module.ts')) {
        return AngularFileType.Module;
    } else {
        return undefined;
    }
}
