/* eslint-disable @typescript-eslint/no-require-imports -- Standalone regression runner. */
const assert=require('node:assert/strict');const fs=require('node:fs');const Module=require('node:module');const path=require('node:path');const ts=require('typescript');
const file=path.resolve(__dirname,'../lib/auth-errors.ts');const m=new Module(file,module);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const text=code=>m.exports.authErrorMessage({code,message:'Auth error'});
assert.match(text('same_password'),/už používaš/);assert.match(text('email_not_confirmed'),/nie je potvrdený/);assert.match(text('weak_password'),/bezpečnostné/);assert.match(text('invalid_credentials'),/Nesprávny/);assert.match(text('otp_expired'),/Vyžiadaj/);assert.match(text('over_email_send_rate_limit'),/počka/);assert.match(m.exports.authErrorMessage({message:'Auth session missing!'}),/reláciu/);assert.ok(!text('unknown').includes('Auth error'));
console.log('PASS: same-password, unconfirmed-email, weak-password, invalid-login, expired-link, rate-limit and missing-session messages');
