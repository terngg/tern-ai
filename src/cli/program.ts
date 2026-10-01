import { readFileSync } from 'node:fs';
import { CredentialStore } from '../config/credentials.js';
import { providerRegistry } from '../providers/registry.js';
import { addCredential, authMenu, listCredentials, removeCredential, testCredentials, providerId } from '../commands/credentials.js';
import { Command } from 'commander';
import { ConfigStore, DEFAULT_MODEL, DEFAULT_GEMINI_MODEL } from '../config/store.js';
import { chat } from '../commands/chat.js';
import { doctor, status } from '../commands/doctor.js';
import { runtime, setVerbose } from '../commands/runtime.js';
import { runTask, type TaskOptions } from '../commands/tasks.js';
import { info, output } from './io.js';
import { maskKey } from '../utils/security.js';
import { TernError } from '../utils/errors.js';
const collect=(value:string,previous:string[]):string[]=>[...previous,value];
export function program():Command {
  const cli=new Command().name('tern').description('Tern AI · GTPS Hosting Lua coding assistant').version((JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')) as {version:string}).version);
  cli.option('--verbose','Show provider, model, credential ID and attempt details').hook('preAction',()=>setVerbose(!!cli.opts<{verbose?:boolean}>().verbose));
  cli.option('-f, --file <file.lua>','Explicit Lua file context (repeatable)',collect,[]).argument('[prompt...]','Generate Lua, or start chat without a prompt')
    .action(async(prompt:string[],options:{file:string[]})=>{if(prompt.length)await runTask('generate',prompt.join(' '),options.file,{});else await chat(options.file);});
  cli.command('chat').description('Interactive session with optional Lua files').argument('[files...]').action(async(files:string[])=>chat([...cli.opts<{file:string[]}>().file,...files]));
  cli.command('generate').description('Generate a complete Lua script').argument('<prompt...>')
    .option('-o, --output <path>','Write validated script to a file').option('--force','Overwrite output file').option('--raw','Only validated Lua on stdout; no progress messages')
    .option('-f, --file <file.lua>','Explicit Lua context (repeatable)',collect,[])
    .action(async(prompt:string[],options:TaskOptions)=>runTask('generate',prompt.join(' '),[...cli.opts<{file:string[]}>().file,...options.file || []],options));
  cli.command('fix').description('Show a diff; --write applies validated changes').argument('<file.lua>').option('--write','Apply changes after successful validation')
    .action(async(file:string,options:TaskOptions)=>runTask('fix','Perbaiki script ini.',[file],options));
  for(const task of ['review','explain'] as const) cli.command(task).description(task==='review'?'Review API compatibility and runtime risks':'Explain a Lua script').argument('<file.lua>').action(async(file:string)=>runTask(task,task==='review'?'Review script ini.':'Jelaskan script ini.',[file],{}));
  cli.command('models').description('List provider models (OpenRouter default, cached for 6 hours)').argument('[provider]','gemini or openrouter','openrouter').option('--free','Only free models (default)').option('--all','Include paid models').option('--refresh','Refresh cache')
    .action(async(provider:string,options:{all?:boolean;refresh?:boolean})=>{
      const id=providerId(provider);
      if(id==='gemini'){
        const keys=(await new CredentialStore().load()).filter(c=>c.provider===id);
        if(!keys.length)throw new TernError('No Gemini credential. Run tern auth add gemini.');
        let last:unknown;
        for(const key of keys){try{for(const m of await providerRegistry().gemini.listModels(key.key))output('  '+m.id);return;}catch(error){last=error;}}
        throw last;
      }
      const rt=await runtime(false);output(options.all?'OpenRouter Models':'Free OpenRouter Models');
      const models=await rt.catalog.list(!!options.refresh);
      if(!models.some(m=>m.id===DEFAULT_MODEL))output('  '+DEFAULT_MODEL+' (default free router)');
      for(const m of models)if(options.all || m.free)output(`  ${m.id}${m.free?'':' (paid)'}`);
    });
  const model=cli.command('model').description('Show or select provider models').action(async()=>{const c=await new ConfigStore().load();output(`Gemini: ${c.providers.gemini.model}\nOpenRouter: ${c.model}`);});
  model.command('set').argument('<provider-or-model>').argument('[model-id]').description('Set provider model; legacy single OpenRouter ID also accepted').action(async(first:string,second?:string)=>{
    const provider=second?providerId(first):'openrouter';const id=second || first;
    await new ConfigStore().setModel(provider,id);output(`✓ ${provider} model: ${id}`);
    if(provider==='openrouter' && id!==DEFAULT_MODEL && !id.endsWith(':free'))info('This explicitly selected model may incur charges. No paid model is selected automatically.');
  });
  model.command('reset').argument('[provider]','Provider to reset','openrouter').action(async(name:string)=>{const p=providerId(name);await new ConfigStore().setModel(p,p==='gemini'?DEFAULT_GEMINI_MODEL:DEFAULT_MODEL);output('✓ Model reset.');});
  const provider=cli.command('provider').description('Show provider mode and priority').action(async()=>{const c=await new ConfigStore().load();output(`Provider mode: ${c.providerMode}\n\nPriority:\n${c.providerPriority.map((p,i)=>`${i+1}. ${p}`).join('\n')}`);});
  provider.command('set').argument('<mode>','auto, gemini, or openrouter').action(async(mode:string)=>{await new ConfigStore().set('providerMode',mode);output('✓ Provider mode: '+mode);});
  provider.command('auto').action(async()=>{await new ConfigStore().set('providerMode','auto');output('✓ Provider mode: auto');});
  const auth=cli.command('auth').description('Manage multiple provider credentials').action(authMenu);
  auth.command('add').argument('<provider>').action(addCredential);
  auth.command('list').action(listCredentials);
  auth.command('remove').argument('<id>').option('--yes','Confirm removal without prompting').action(async(id:string,opts:{yes?:boolean})=>removeCredential(id,!!opts.yes));
  auth.command('test').argument('[provider-or-id]').action(testCredentials);
  auth.command('status').action(async()=>{const credential=await new ConfigStore().credential();output(credential?`OpenRouter: authenticated (key configured; run tern doctor to verify)\nAPI key: ${maskKey(credential.key)}\nSource: ${credential.source}`:'OpenRouter: not authenticated\nRun: tern auth');await listCredentials();});
  auth.command('logout').description('Remove saved OpenRouter credentials (legacy command)').action(async()=>{const store=new CredentialStore();for(const c of await store.load({}))if(c.provider==='openrouter')await store.remove(c.id);output('✓ Saved OpenRouter credentials removed. Environment keys remain active.');});
  cli.command('status').description('Local provider/key/index status').option('--live','Check API connectivity without generation').action(async(opts:{live?:boolean})=>status(!!opts.live));
  const config=cli.command('config').description('Inspect and edit validated configuration').action(async()=>output(JSON.stringify(await new ConfigStore().load(),null,2)));
  config.command('list').action(async()=>output(JSON.stringify(await new ConfigStore().load(),null,2)));
  config.command('get').argument('<key>').action(async(key:string)=>{const values=await new ConfigStore().load();if(!Object.hasOwn(values,key))throw new TernError('Unknown configuration key: '+key);output(String(values[key as keyof typeof values]));});
  config.command('set').argument('<key>').argument('<value>').action(async(key:string,value:string)=>{
    let parsed:unknown=value;if(['temperature','maxRepairAttempts'].includes(key))parsed=Number(value);else if(key==='stream')parsed=value==='true'?true:value==='false'?false:value;else if(key==='providerPriority' || key==='providers'){try{parsed=JSON.parse(value) as unknown;}catch{throw new TernError('Expected valid JSON.');}}
    await new ConfigStore().set(key,parsed);output('✓ Configuration updated.');
  });
  cli.command('doctor').description('Check local setup and available providers (no generation)').option('--offline','Skip network check').action(async(options:{offline?:boolean})=>doctor(!!options.offline));

  const companion = cli.command('companion').description('Manage Tern Companion for local/desktop AI provider routing').action(async () => {
    const { runCompanion } = await import('../commands/companion.js');
    await runCompanion();
  });
  companion.command('pair').argument('<code>').option('--server <url>', 'Server URL').description('Pair this local machine with your Tern AI account').action(async (code: string, opts: { server?: string }) => {
    const { pairCompanion } = await import('../commands/companion.js');
    await pairCompanion(code, opts);
  });
  companion.command('status').description('Show companion pairing status and detected local providers').action(async () => {
    const { companionStatus } = await import('../commands/companion.js');
    await companionStatus();
  });
  companion.command('providers').description('List detected local AI providers, models, and health').action(async () => {
    const { companionProviders } = await import('../commands/companion.js');
    await companionProviders();
  });

  return cli;
}
