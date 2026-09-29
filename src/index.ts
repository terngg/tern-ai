#!/usr/bin/env node
import { program } from './cli/program.js';
import { TernError, messageOf } from './utils/errors.js';
import { redact, terminalText } from './utils/security.js';
import { CredentialStore } from './config/credentials.js';
// Broken pipes are normal when piping to head or another short-lived consumer.
process.stdout.on('error',(error:NodeJS.ErrnoException)=>{
  if(error.code==='EPIPE')process.exit(0);
  process.stderr.write('✗ Cannot write terminal output.\n');process.exitCode=1;
});
try { await new CredentialStore().load(); await program().parseAsync(process.argv); }
catch(error) {
  process.stderr.write('✗ '+terminalText(redact(messageOf(error)))+'\n');
  process.exitCode=error instanceof TernError?error.exitCode:1;
}
