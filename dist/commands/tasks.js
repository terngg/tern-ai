import { createTwoFilesPatch } from 'diff';
import { assistant, runtime, verboseEnabled } from './runtime.js';
import { assertWritable, readContexts, saveLua } from '../utils/files.js';
import { validateLua } from '../gtps/validator.js';
import { info, output, status, TokenWriter, warn } from '../cli/io.js';
import { TernError } from '../utils/errors.js';
export function checkResult(result) {
    for (const warning of result.warnings)
        warn(warning);
    for (const finding of result.validation?.findings || [])
        info(`${finding.severity === 'error' ? '✗' : '⚠'} line ${finding.line}: ${finding.message}`);
    if (!result.code)
        throw new TernError(result.explanation || 'Model did not return a complete Lua script.', 2);
    if (result.validation?.findings.some(f => f.severity === 'error'))
        throw new TernError('Validation failed after repair. Generated code was not saved. Review the diagnostics and refine the request.', 2);
    return result.code;
}
export async function runTask(task, prompt, paths, options) {
    if (options.output)
        await assertWritable(options.output, !!options.force);
    const files = await readContexts(paths);
    const rt = await runtime();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.on('SIGINT', cancel);
    const showDraft = !options.raw && ['generate', 'review', 'explain'].includes(task) && process.stdout.isTTY;
    const writer = new TokenWriter(rt.key);
    try {
        if (task === 'review') {
            output('Tern Review');
            for (const file of files) {
                const v = validateLua(file.content, rt.index);
                output(`${file.name}: ${v.recognized.length} APIs recognized; Lua syntax ${v.syntaxValid ? 'valid' : 'invalid'}`);
                for (const f of v.findings)
                    output(`${f.severity === 'error' ? '✗' : '⚠'} line ${f.line}: ${f.message}`);
            }
        }
        const result = await assistant(rt, options.raw && !verboseEnabled() ? () => undefined : message => { writer.end(); status(message); }).run({ task, prompt, files, signal: controller.signal, ...(showDraft ? { onToken: (t) => writer.write(t) } : {}) });
        if (showDraft)
            writer.end();
        if (task === 'review' || task === 'explain') {
            if (!showDraft)
                output(result.text);
            return;
        }
        const code = checkResult(result);
        if (task === 'fix') {
            const file = files[0];
            if (!file)
                throw new TernError('A Lua file is required.');
            const patch = createTwoFilesPatch(file.name, file.name, file.content, code.trimEnd() + '\n', 'original', 'fixed');
            output(patch);
            if (options.write) {
                await saveLua(file.path, code, true, file.content);
                info(`✓ Script updated: ${file.name}`);
            }
            else
                info('Use --write to apply the fix.');
        }
        else if (options.output) {
            await saveLua(options.output, code, !!options.force);
            info(`✓ Script written to ${options.output}`);
        }
        else if (options.raw || !showDraft)
            process.stdout.write(code.trimEnd() + '\n');
        if (!options.raw)
            info(`✓ Lua syntax valid · ${result.validation?.recognized.length || 0} recognized GTPS APIs · no detected unsupported calls`);
    }
    finally {
        writer.end();
        process.off('SIGINT', cancel);
    }
}
//# sourceMappingURL=tasks.js.map