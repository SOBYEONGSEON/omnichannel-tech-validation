import {build} from 'esbuild';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
await mkdir('dist/extension',{recursive:true});
await build({entryPoints:['src/extension/content.ts','src/extension/background.ts','src/extension/popup.ts'],bundle:true,outdir:'dist/extension',target:'chrome120',format:'iife',sourcemap:true});
for(const file of ['manifest.json','popup.html'])await copyFile(`src/extension/${file}`,`dist/extension/${file}`);
await writeFile('dist/BUILD_INFO.json',JSON.stringify({timestamp:new Date().toISOString()},null,2));
console.log('Extension built: dist/extension');
