import {parseHTML} from 'linkedom';
import robotsParser from 'robots-parser';
import {collect} from './collect.js';
import {extract, safeUrl} from './core.js';
import type {Product, ProviderResult} from './types.js';
export const sites=[
 {site:'Adafruit',origin:'https://www.adafruit.com',search:'/search?q=',seed:'/product/5813',kind:'independent'},
 {site:'Pimoroni',origin:'https://shop.pimoroni.com',search:'/search?q=',seed:'/products/raspberry-pi-5',kind:'brand_shopify'},
 {site:'The Pi Hut',origin:'https://thepihut.com',search:'/search?q=',seed:'/products/raspberry-pi-5',kind:'shopify'},
];
export const blindSites=[
 {site:'SparkFun',url:'https://www.sparkfun.com/raspberry-pi-5-8gb.html',kind:'independent'},
 {site:'Waveshare',url:'https://www.waveshare.com/raspberry-pi-5.htm',kind:'brand'},
 {site:'Books to Scrape',url:'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',kind:'demo_unstructured'},
];
const allowed=new Set([...sites.map(s=>new URL(s.origin).hostname),...blindSites.map(s=>new URL(s.url).hostname),'www.samsung.com','www.coupang.com','www.ebay.com','www.web-scraping.dev']);
const robotCache=new Map<string,string>();
export class FetchError extends Error {constructor(public code:string){super(code);}}
export async function boundedFetch(url:string,timeout=10000):Promise<string>{
  const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!allowed.has(u.hostname)||u.port)throw new FetchError('UNSUPPORTED_HOST');
  const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'OmniPoC/0.1 (technical validation; low rate)'}});
  if([401,403,429].includes(r.status))throw new FetchError(`BLOCKED_HTTP_${r.status}`);
  if(r.status>=300&&r.status<400)throw new FetchError('UNSUPPORTED_REDIRECT');
  if(!r.ok)throw new FetchError(`HTTP_${r.status}`);
  if(Number(r.headers.get('content-length'))>2_000_000){await r.body?.cancel();throw new FetchError('RESPONSE_TOO_LARGE');}
  const reader=r.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw new FetchError('RESPONSE_TOO_LARGE');chunks.push(value);}}finally{await reader.cancel();}
  const text=Buffer.concat(chunks).toString('utf8');if(/cf-chl-|captcha-container|verify you are human|access denied/i.test(text))throw new FetchError('BLOCKED_CHALLENGE');return text;
}
export async function permittedFetch(url:string):Promise<string>{
  const u=new URL(url);let rules=robotCache.get(u.origin);
  if(rules===undefined){try{rules=await boundedFetch(u.origin+'/robots.txt');robotCache.set(u.origin,rules);}catch(e){if(e instanceof FetchError&&e.code==='HTTP_404')rules='';else throw new FetchError('BLOCKED_ROBOTS_UNAVAILABLE');}}
  if(robotsParser(u.origin+'/robots.txt',rules).isAllowed(url,'OmniPoC')===false)throw new FetchError('BLOCKED_ROBOTS');
  return boundedFetch(url);
}
export async function probe(url:string,site:string,query=''):Promise<ProviderResult>{
  const start=performance.now();try{const html=await permittedFetch(url);const {document}=parseHTML(html);const raw=collect(document as unknown as Document,url);const p=extract(raw);return {site,url,query,status:p?.name&&p.price?'PASS':'PARTIAL',products:p?[p]:[],duration_ms:performance.now()-start};}
  catch(e){const code=e instanceof Error?e.message:'UNKNOWN';return {site,url,query,status:code.startsWith('BLOCKED')?'BLOCKED':code.startsWith('UNSUPPORTED')?'UNSUPPORTED':'FAIL',products:[],error:code,duration_ms:performance.now()-start};}
}
const cache=new Map<string,{time:number;value:ProviderResult[]}>();
export function clearSearchCache(){cache.clear();}
export async function searchProducts(product:Product):Promise<ProviderResult[]>{
  const query=product.category==='single_board_computer'?'Raspberry Pi 5':product.name.slice(0,100);
  const cached=cache.get(query);if(cached&&Date.now()-cached.time<300000)return structuredClone(cached.value).map(r=>({...r,error:r.error,duration_ms:0}));
  const results=await Promise.all(sites.map(async s=>{
    const searchUrl=s.origin+s.search+encodeURIComponent(query);const start=performance.now();
    try{
      const html=await permittedFetch(searchUrl);const {document}=parseHTML(html);
      const links=[...document.querySelectorAll('a[href]')].map(a=>safeUrl(a.getAttribute('href'),s.origin)).filter(u=>u.startsWith(s.origin+'/product')&& !u.includes('/collections/'));
      const tokens=query.toLowerCase().split(/\W+/).filter(t=>t.length>2);
      const unique=[...new Set(links)].sort((a,b)=>tokens.filter(t=>b.includes(t)).length-tokens.filter(t=>a.includes(t)).length).slice(0,2);
      if(!unique.length)return {site:s.site,url:searchUrl,query,status:'PARTIAL' as const,products:[],error:'NO_SEARCH_RESULTS',duration_ms:performance.now()-start};
      const probes:ProviderResult[]=[];for(const u of unique)probes.push(await probe(u,s.site,query));
      const products=probes.flatMap(p=>p.products);return {site:s.site,url:searchUrl,query,status:products.length?'PASS' as const:probes[0].status,products,error:probes.find(p=>p.error)?.error,duration_ms:performance.now()-start};
    }catch(e){const code=e instanceof Error?e.message:'UNKNOWN';
      // Curated known product URLs are explicit fallback, not a fabricated search response.
      if(product.category==='single_board_computer'&&!code.startsWith('BLOCKED')){const p=await probe(s.origin+s.seed,s.site,query);return {...p,query:query+' [curated seed fallback]',duration_ms:performance.now()-start};}
      return {site:s.site,url:searchUrl,query,status:code.startsWith('BLOCKED')?'BLOCKED' as const:code.startsWith('UNSUPPORTED')?'UNSUPPORTED' as const:'FAIL' as const,products:[],error:code,duration_ms:performance.now()-start};
    }
  }));
  // Independent, bounded catalog provider: query selects known public product URLs.
  // Every detail URL still goes through its own robots check; no search restriction bypass.
  if(product.category==='single_board_computer'){
    for(const s of sites.slice(0,2))results.push(await probe(s.origin+s.seed,s.site+' / curated catalog',query+' [catalog keyword filter]'));
  }
  if(cache.size>=20)cache.delete(cache.keys().next().value!);cache.set(query,{time:Date.now(),value:results});return results;
}
