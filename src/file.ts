import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

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
