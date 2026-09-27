import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {clean,decide,extract,queriesFor,rank} from './core.js';
import {runOcr} from './ocr.js';
import {searchProducts,clearSearchCache} from './search.js';
import type {RawPage,Run,ProviderResult} from './types.js';
export const runs=new Map<string,Run>();
export const stored=new Map<string,{timestamp:string;expires:number;interest:unknown;product:unknown;results:unknown}>();
export function purge(){const now=Date.now();for(const [id,r] of stored)if(r.expires<now)stored.delete(id);for(const [id,r] of runs)if(now-Date.parse(r.logs[0]?.timestamp||'')>600000)runs.delete(id);}
export function eraseAll(){runs.clear();stored.clear();clearSearchCache();}
export function createRun(raw:RawPage):Run{
  purge();if(runs.size>=20)runs.delete(runs.keys().next().value!);
  const run:Run={session_id:randomUUID(),status:'created',raw,capture:decide(raw),extracted:{product:null,ocr_raw:null},classification:{},queries:[],results:[],providers:[],storage:{},discarded:[],timings:{capture_latency:0,preprocess_latency:0,ocr_latency:0,extract_latency:0,classify_latency:0,search_latency:0,ranking_latency:0,render_latency:0,total_latency:0},logs:[],resources:{}};runs.set(run.session_id,run);return run;
}
export async function processRun(run:Run,options:{image?:string;capture_ms?:number;capture_error?:string;search?:(p:NonNullable<Run['extracted']['product']>)=>Promise<ProviderResult[]>;ocr?:typeof runOcr}={}){
  const start=performance.now();const cpuStart=process.cpuUsage();const samples:{cpu:number;ram:number;stage:string}[]=[];let cpuPrev=process.cpuUsage(),wall=performance.now();
  const sample=()=>{const now=performance.now();const cpu=process.cpuUsage(cpuPrev);cpuPrev=process.cpuUsage();samples.push({cpu:(cpu.user+cpu.system)/1000/Math.max(1,now-wall)*100,ram:process.memoryUsage().rss/1048576,stage:run.status});wall=now;};
  const monitor=setInterval(sample,50);
  const stage=async<T>(name:string,input:unknown,fn:()=>T|Promise<T>):Promise<T>=>{run.status=name;const t=performance.now();try{const result=await fn();const duration=performance.now()-t;run.timings[name+'_latency']=duration;run.logs.push({timestamp:new Date().toISOString(),session_id:run.session_id,stage:name,duration_ms:duration,success:true,cpu_percent:samples.at(-1)?.cpu||0,memory_mb:process.memoryUsage().rss/1048576,input,output:name==='extract'?{has_product:!!result}:name==='search'?{provider_count:(result as ProviderResult[]).length}:'completed',error:null});return result;}catch(e){const code=e instanceof Error?e.message:'UNKNOWN';run.logs.push({timestamp:new Date().toISOString(),session_id:run.session_id,stage:name,duration_ms:performance.now()-t,success:false,cpu_percent:0,memory_mb:process.memoryUsage().rss/1048576,input,output:null,error:{code:clean(code,80),message:'stage failed; raw input omitted'}});throw e;}};
  const discard=(data:string,reason:string)=>run.discarded.push({data,reason,timestamp:new Date().toISOString()});
  try{
    await stage('decision',{domain:run.raw.domain},()=>run.capture);
    if(!run.capture.capture){run.status='skipped';discard('page body and screenshot','capture denied; not collected');return run;}
    run.timings.capture_latency=Math.max(0,options.capture_ms||0);run.capture.performed=!!options.image;run.capture.timestamp=new Date().toISOString();
    if(options.capture_error)run.logs.push({timestamp:new Date().toISOString(),session_id:run.session_id,stage:'capture',duration_ms:run.timings.capture_latency,success:false,cpu_percent:0,memory_mb:process.memoryUsage().rss/1048576,input:null,output:null,error:{code:'CAPTURE_FAILED',message:'DOM fallback used'}});
    let product=await stage('extract',{sources:['json_ld','meta','dom']},()=>extract(run.raw));
    if(options.image){
      try{const buf=Buffer.from(options.image.split(',')[1]||'','base64');try{const meta=await sharp(buf,{limitInputPixels:16_000_000}).metadata();run.capture.width=meta.width;run.capture.height=meta.height;run.capture.bytes=buf.length;}finally{buf.fill(0);}
        if(!product?.name||product.price===null){const result=await stage('ocr',{reason:'missing_name_or_price'},()=> (options.ocr||runOcr)(options.image!,run.raw.roi));run.timings.preprocess_latency=result.preprocess_latency;run.timings.ocr_latency=result.ocr_latency;run.extracted.ocr_raw=clean(result.text,1500);product=extract(run.raw,result.text);discard('OCR full original text','only redacted transient inspector preview; no persistent storage');}
      }catch(e){run.logs.push({timestamp:new Date().toISOString(),session_id:run.session_id,stage:'ocr_fallback',duration_ms:0,success:false,cpu_percent:0,memory_mb:process.memoryUsage().rss/1048576,input:null,output:null,error:{code:clean(e instanceof Error?e.message:'OCR_FAILED',80),message:'DOM result retained'}});}
      finally{options.image=undefined;discard('original screenshot and temporary processed image','references released; buffer overwritten; never written to disk');}
    }else discard('original screenshot','not received or capture failed');
    run.extracted.product=product;if(!product){run.status='no_product';return run;}
    run.classification=await stage('classify',{product_id:product.product_id},()=>({shopping_page:true,shopping_confidence:run.capture.confidence,category:product!.category,confidence:product!.provenance.category.confidence,name:product!.name,brand:product!.brand,price_range:product!.price?`${Math.floor(product!.price/100)*100}-${Math.ceil(product!.price/100)*100} ${product!.currency}`:'unknown',interest:product!.normalized_name,keywords:queriesFor(product!)}));
    run.queries=queriesFor(product);run.providers=await stage('search',{queries:run.queries},()=>(options.search||searchProducts)(product!));
    run.results=await stage('ranking',{product_ids:run.providers.flatMap(p=>p.products.map(x=>x.product_id))},()=>rank(product!,run.providers.flatMap(p=>p.products)));
    const timestamp=new Date().toISOString();const value={timestamp,expires:Date.now()+600000,interest:run.classification,product,results:run.results};
    if(stored.size>=20)stored.delete(stored.keys().next().value!);stored.set(run.session_id,value);
    run.storage={location:'backend RAM only; TTL 10 minutes; max 20 runs',timestamp,session_id:run.session_id,interest:run.classification,structured_product:product,search_results:run.results,recommendation_input_ids:run.results.map(r=>r.product_id)};
    discard('form values, cookies, account text, arbitrary DOM','never collected');discard('non-product DOM / JSON-LD fields','allowlist dropped before transfer');
    run.status=run.results.length?'complete':'complete_no_results';return run;
  }catch{run.status='error';return run;}finally{
    clearInterval(monitor);sample();const cpu=process.cpuUsage(cpuStart);run.timings.total_latency=performance.now()-start+run.timings.capture_latency;
    run.resources={scope:'backend process; CPU percent of one logical core; 50ms samples',cpu_average_percent:(cpu.user+cpu.system)/1000/Math.max(1,performance.now()-start)*100,cpu_peak_percent:Math.max(0,...samples.map(s=>s.cpu)),ram_average_mb:samples.reduce((s,x)=>s+x.ram,0)/(samples.length||1),ram_peak_mb:Math.max(0,...samples.map(s=>s.ram)),samples,gpu:null};
  }
}
