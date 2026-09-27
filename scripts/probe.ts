import {probe,sites,blindSites} from '../src/search.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const freeze=createHash('sha256').update(await readFile('src/collect.ts')).update(await readFile('src/core.ts')).digest('hex');
const out=[];
for(const s of sites){const r=await probe(s.origin+s.seed,s.site);out.push({...r,blind:false,kind:s.kind});console.log(JSON.stringify({site:s.site,status:r.status,error:r.error,product:r.products.map(p=>({name:p.name,price:p.price,currency:p.currency}))}));}
// Blind target pages are not inspected before this generic collector snapshot is frozen.
for(const s of blindSites){const r=await probe(s.url,s.site);out.push({...r,blind:true,kind:s.kind});console.log(JSON.stringify({site:s.site,status:r.status,error:r.error,product:r.products.map(p=>({name:p.name,price:p.price,currency:p.currency}))}));}
for(const s of [{site:'Coupang',url:'https://www.coupang.com/np/search?q=galaxy+buds3+pro',kind:'korean_marketplace'},{site:'Samsung',url:'https://www.samsung.com/us/mobile-audio/galaxy-buds3-pro/',kind:'official_brand'},{site:'eBay',url:'https://www.ebay.com/sch/i.html?_nkw=raspberry+pi+5',kind:'used_marketplace'}]){const r=await probe(s.url,s.site);out.push({...r,blind:false,kind:s.kind});console.log(JSON.stringify({site:s.site,status:r.status,error:r.error}));}
await writeFile('artifacts/crawl-results.json',JSON.stringify({timestamp:new Date().toISOString(),extractor_sha256:freeze,results:out},null,2));
