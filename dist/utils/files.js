import { open, lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isMissing, TernError } from './errors.js';
export const MAX_FILE_BYTES = 16_384;
export async function readContexts(paths) {
    const unique = [...new Set(paths.map(p => resolve(p)))];
    if (unique.length > 5)
        throw new TernError('At most 5 explicit Lua context files are allowed.');
    const result = [];
    let total = 0;
    for (const path of unique) {
        if (extname(path).toLowerCase() !== '.lua')
            throw new TernError(`Only .lua context files are accepted: ${basename(path)}`);
        const file = await open(path, 'r');
        try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.size > MAX_FILE_BYTES)
                throw new TernError(`Context must be a regular Lua file of at most ${MAX_FILE_BYTES} bytes: ${basename(path)}`);
            const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
            const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
            total += bytesRead;
            if (bytesRead > MAX_FILE_BYTES || total > MAX_FILE_BYTES)
                throw new TernError('Combined file context exceeds 16 KiB. Supply a smaller script; files are never silently truncated.');
            const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead));
            if (content.includes('\0'))
                throw new TernError('Binary file is not valid Lua context.');
            result.push({ path, name: basename(path), content });
        }
        finally {
            await file.close();
        }
    }
    return result;
}
export async function assertWritable(path, force) {
    try {
        const stat = await lstat(path);
        if (stat.isSymbolicLink() || !stat.isFile())
            throw new TernError('Refusing to overwrite a symlink or non-regular file.');
        if (!force)
            throw new TernError(`File already exists: ${path}. Use --force to overwrite.`);
    }
    catch (error) {
        if (!isMissing(error))
            throw error;
    }
}
export async function saveLua(path, code, force = false, original) {
    await assertWritable(path, force);
    if (original !== undefined && await readFile(path, 'utf8') !== original)
        throw new TernError('File changed while generating. Refusing to overwrite newer edits.');
    const content = code.trimEnd() + '\n';
    if (!force) {
        await writeFile(path, content, { flag: 'wx', mode: 0o600 });
        return;
    }
    const temporary = join(dirname(path), `.tern-${randomUUID()}.tmp`);
    try {
        const permissions = await lstat(path).then(s => s.mode & 0o777).catch(error => { if (isMissing(error))
            return 0o600; throw error; });
        await writeFile(temporary, content, { flag: 'wx', mode: permissions });
        if (original !== undefined && await readFile(path, 'utf8') !== original)
            throw new TernError('File changed while generating. Refusing to overwrite newer edits.');
        await rename(temporary, path);
    }
    finally {
        await rm(temporary, { force: true });
    }
}
//# sourceMappingURL=files.js.map