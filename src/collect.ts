import {clean, productsIn, safeUrl} from './core.js';
import type {RawPage} from './types.js';
// Shared generic collector: no merchant-specific selectors, input values never read.
export function collect(doc:Document,url:string):RawPage {
  const safe=safeUrl(url);const domain=new URL(safe||'https://invalid.local').hostname;
  const title=doc.documentElement?clean(doc.title):'';const password=!!doc.querySelector('input[type=password],input[autocomplete*="cc-"],input[autocomplete="one-time-code"]');
  const sensitive=password||/(login|signin|signup|checkout|payment|bank|mail\.|messenger|medical|hospital|account|privacy|로그인|결제|의료|병원)/i.test(safe+' '+title)||!!doc.querySelector('[contenteditable="true"],textarea[name*="message"],input[autocomplete="email"],input[autocomplete="tel"]');
  const empty:RawPage={url:sensitive?new URL(safe||'https://invalid.local').origin+'/[REDACTED]':safe,title:sensitive?'[SENSITIVE PAGE]':title,domain,text:'',jsonld:[],meta:{},candidates:{},signals:{password,sensitive,purchase:false,price:false,product:false},roi:null};
  if(sensitive||!doc.documentElement)return empty;
  const jsonld:unknown[]=[];
  for(const el of [...doc.querySelectorAll('script[type="application/ld+json"]')].slice(0,12)){try{const v=JSON.parse((el.textContent||'').slice(0,150000));for(const p of productsIn(v)){
    // Allowlist product fields; exclude review prose, authors, descriptions and personal data.
    const offers=[p.offers].flat().slice(0,5).filter(Boolean).map((o:any)=>({price:o.price,lowPrice:o.lowPrice,priceCurrency:o.priceCurrency,itemCondition:o.itemCondition,seller:{name:clean(o.seller?.name)}}));
    jsonld.push({'@type':'Product',name:clean(p.name),brand:typeof p.brand==='string'?clean(p.brand):{name:clean(p.brand?.name)},model:clean(p.model),mpn:clean(p.mpn),category:clean(p.category),url:safeUrl(p.url,safe),image:typeof p.image==='string'?safeUrl(p.image,safe):Array.isArray(p.image)?p.image.slice(0,2).map((i:unknown)=>safeUrl(i,safe)):undefined,offers,aggregateRating:{ratingValue:p.aggregateRating?.ratingValue,reviewCount:p.aggregateRating?.reviewCount,ratingCount:p.aggregateRating?.ratingCount}});
  }}catch{/* malformed JSON-LD falls through */}}
  const meta:Record<string,string>={};
  for(const el of doc.querySelectorAll('meta[property],meta[name]')){const key=el.getAttribute('property')||el.getAttribute('name')||'';if(/^(og:(title|type|image)|product:(price:amount|price:currency|brand)|og:price:amount)$/.test(key))meta[key]=clean(el.getAttribute('content'),1000);}
  const candidates:Record<string,string[]>={};
  const selectors:Record<string,string>={name:'[itemprop="name"],h1',price:'[itemprop="price"],[data-price],[class*="price" i]',brand:'[itemprop="brand"]',model:'[itemprop="mpn"],[itemprop="model"]',category:'[itemprop="category"]',rating:'[itemprop="ratingValue"]',review_count:'[itemprop="reviewCount"]',currency:'[itemprop="priceCurrency"]',image:'[itemprop="image"]'};
  for(const [field,selector] of Object.entries(selectors)){candidates[field]=[...doc.querySelectorAll(selector)].filter(el=>!el.closest('#omni-poc-host,header,nav,footer,form,[contenteditable]')).slice(0,8).map(el=>clean(el.getAttribute('content')||el.getAttribute(field==='image'?'src':'data-price')||el.textContent,field==='image'?1000:180)).filter(Boolean);}
  const buttons=[...doc.querySelectorAll('button,[role="button"],input[type="submit"],a')].slice(0,400).filter(el=>!el.closest('#omni-poc-host')).map(el=>clean(el.textContent||el.getAttribute('value'),50)).join(' ');
  const purchase=/add to (?:cart|bag|basket)|buy now|장바구니|구매하기|바로구매/i.test(buttons);
  const price=candidates.price.some(s=>/\d/.test(s))||!!meta['product:price:amount'];
  const root=doc.querySelector('main,[itemtype*="Product"],article')||doc.body;
  const headings=[...root.querySelectorAll('h1,h2,[itemprop="name"],[itemprop="price"]')].slice(0,15).map(e=>clean(e.textContent)).join(' | ');
  const region=doc.querySelector('h1')?.parentElement;let roi:RawPage['roi']=null;
  if(region&&typeof region.getBoundingClientRect==='function'){const r=region.getBoundingClientRect();if(r.width>0&&r.height>0)roi={left:Math.max(0,r.left),top:Math.max(0,r.top),width:Math.min(r.width,1600),height:Math.min(r.height,1000)};}
  return {...empty,jsonld,meta,candidates,text:headings.slice(0,2000),signals:{password,sensitive,purchase,price,product:jsonld.length>0||!!doc.querySelector('[itemtype*="schema.org/Product"]')},roi};
}
