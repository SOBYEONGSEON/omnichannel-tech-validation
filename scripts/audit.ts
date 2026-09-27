import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
let result:string;try{result=execFileSync(process.execPath,[join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'audit','--json','--cache','.tools/npm-cache'],{encoding:'utf8',windowsHide:true});}catch(e){result=(e as {stdout?:string}).stdout||'{}';}
const data=JSON.parse(result);await writeFile('artifacts/npm-audit.json',JSON.stringify(data,null,2));console.log(JSON.stringify(data.metadata?.vulnerabilities||data.error));
