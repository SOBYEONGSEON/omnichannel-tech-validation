import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir,cp,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {productHtml} from '../tests/fixtures.js';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.tools/browsers');
const token=(await readFile('artifacts/server-token.txt','utf8')).trim();const headers={Authorization:`Bearer ${token}`};
const fixture=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');if(req.url==='/dynamic'){res.end('<title>Dynamic shop</title><main id="p"></main><script>setTimeout(()=>{document.getElementById("p").innerHTML=\'<h1>Raspberry Pi 5</h1><p class="price">£80.00</p><button>Add to cart</button>\'},500)</script>');}else if(req.url==='/login')res.end(productHtml(undefined,259000,'<input type="password" value="FAKE-SECRET">'));else res.end(productHtml());});
await new Promise<void>(r=>fixture.listen(8788,'127.0.0.1',r));
// Automation cannot click browser chrome to grant activeTab. Broader permission is
// confined to a separate test build; shipped dist/extension remains activeTab-only.
await cp('dist/extension','dist/test-extension',{recursive:true});
const manifest=JSON.parse(await readFile('dist/test-extension/manifest.json','utf8'));
manifest.host_permissions=['<all_urls>'];manifest.name+=' TEST ONLY';
await writeFile('dist/test-extension/manifest.json',JSON.stringify(manifest,null,2));
const ext=resolve('dist/test-extension');await mkdir('artifacts',{recursive:true});
const profile=await mkdtemp(resolve('artifacts/browser-profile-e2e-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`],viewport:{width:1360,height:900}});
const output:{browser:string;timestamp:string;permission_note:string;cases:any[];repeat:any[];errors:string[]}={browser:context.browser()?.version()||'Chrome for Testing',timestamp:new Date().toISOString(),permission_note:'Automated harness uses separate TEST ONLY manifest with <all_urls>; production activeTab click grant requires manual smoke test. No production permission change.',cases:[],repeat:[],errors:[]};
try{
  context.on('response',response=>{if(response.url()==='http://127.0.0.1:8787/metrics'&&response.status()!==200)output.errors.push(`metrics HTTP ${response.status()}`);});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const extensionId=new URL(worker.url()).hostname;
  const page=await context.newPage();page.on('pageerror',e=>output.errors.push(e.message));const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  async function authorize(url:string){await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await page.bringToFront();
    const id=await worker.evaluate(async({token,url})=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url)!;await chrome.storage.session.set({token,consentedTab:tab.id,consentedOrigin:new URL(url).origin});return tab.id!;},{token,url:page.url()});
    // Test harness grants explicit host access through the extension permission UI.
    // Browser action activeTab grant cannot be synthesized by scripting APIs.
    const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);await popup.close();await page.bringToFront();
    await worker.evaluate(async(tabId)=>{await chrome.scripting.executeScript({target:{tabId},files:['content.js']});},id);
  }
  for(const spec of [{name:'real_product',url:'https://www.adafruit.com/product/5813'},{name:'synthetic_product',url:'http://127.0.0.1:8788/product'},{name:'sensitive_login',url:'http://127.0.0.1:8788/login'},{name:'dynamic_dom',url:'http://127.0.0.1:8788/dynamic'}]){
    await new Promise(r=>setTimeout(r,2700));const t=performance.now();try{await authorize(spec.url);await page.waitForFunction(()=>['complete','complete_no_results','skipped','error','no_product'].includes(document.getElementById('omni-poc-host')?.dataset.status||''),{},{timeout:90000});const state=await page.locator('#omni-poc-host').evaluate(el=>({status:(el as HTMLElement).dataset.status,id:(el as HTMLElement).dataset.session,text:el.shadowRoot?.textContent}));const run=state.id?await (await fetch('http://127.0.0.1:8787/runs/'+state.id,{headers})).json():null;const metrics=await cdp.send('Performance.getMetrics');output.cases.push({name:spec.name,url:spec.url,status:state.status,run,widget_contains_product:!!run?.extracted?.product?.name&&state.text?.includes(run.extracted.product.name),widget_error:state.status==='error'?state.text?.slice(-300):null,duration_ms:performance.now()-t,browser_metrics:metrics.metrics});console.log(JSON.stringify({case:spec.name,status:state.status,capture:run?.capture,results:run?.results?.length}));
    }catch(e){output.cases.push({name:spec.name,status:'FAIL',error:String(e),duration_ms:performance.now()-t});console.log(JSON.stringify({case:spec.name,error:String(e)}));}
  }
  // Thirty actual extension runs on a synthetic dynamic page; public catalog query
  // is served from the backend's five-minute cache after the first live request.
  for(let i=0;i<Number(process.env.E2E_REPEATS||30);i++){
    await new Promise(r=>setTimeout(r,2700));const t=performance.now();
    try{const old=await page.locator('#omni-poc-host').getAttribute('data-session');await page.getByRole('button',{name:'다시 분석',exact:true}).click();await page.waitForFunction(old=>{const el=document.getElementById('omni-poc-host');return !!el?.dataset.session&&el.dataset.session!==old&&['complete','complete_no_results','skipped','error'].includes(el.dataset.status||'');},old,{timeout:45000});
      const id=await page.locator('#omni-poc-host').getAttribute('data-session');await page.waitForTimeout(100);const run=await (await fetch('http://127.0.0.1:8787/runs/'+id,{headers})).json();const metrics=await cdp.send('Performance.getMetrics');
      output.repeat.push({iteration:i+1,pass:run.status==='complete'&&run.capture.performed&&run.results.length>0&&run.timings.client_total_latency>0,status:run.status,result_count:run.results.length,captured:run.capture.performed,timings:run.timings,resources:run.resources,duration_ms:performance.now()-t,browser_metrics:metrics.metrics});
    }catch(e){output.repeat.push({iteration:i+1,pass:false,error:String(e)});}
    if(i%10===9)console.log(JSON.stringify({stage:'extension_repeat',completed:i+1,passed:output.repeat.filter(r=>r.pass).length}));
  }
}finally{await writeFile('artifacts/e2e-results.json',JSON.stringify(output,null,2));if(output.repeat.some(r=>!r.pass)||output.cases.some(r=>r.status==='FAIL'||r.status==='error')||output.cases.find(r=>r.name==='real_product')?.status!=='complete')process.exitCode=1;await context.close();await new Promise<void>(r=>fixture.close(()=>r()));}
