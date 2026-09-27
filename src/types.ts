export type Evidence = {
  value: string | number | null;
  source: string;
  confidence: number};
export interface Product {
  product_id: string;
  name: string;
  normalized_name: string;
  brand: string;
  model: string;
  category: string;
  price: number | null;
  currency: string;
  rating: number | null;
  review_count: number | null;
  seller: string;
  condition: 'new' | 'used' | 'unknown';
  image_url: string;
  product_url: string;
  source_site: string;
  extraction_method: string;
  confidence: number;
  timestamp: string;
  provenance: Record<string, Evidence>;
}
export interface RawPage {
  url: string;
  title: string;
  domain: string;
  text: string;
  jsonld: unknown[];
  meta: Record<string, string>;
  candidates: Record<string, string[]>;
  signals: {
    password: boolean;
    sensitive: boolean;
    purchase: boolean;
    price: boolean;
    product: boolean};
  roi: { left: number; top: number; width: number; height: number } | null;
}
export interface Decision {
  capture: boolean;
  confidence: number;
  reason: string[]}
export interface Ranked extends Product {
  similarity: number;
  score: number;
  reasons: string[];
  match: 'same' | 'similar';
  price_comparable: boolean}
export interface Stage {
  timestamp: string;
  session_id: string;
  stage: string;
  duration_ms: number;
  success: boolean;
  cpu_percent: number;
  memory_mb: number;
  input: unknown;
  output: unknown;
  error: { code: string; message: string } | null}
export interface Run {
  session_id: string;
  status: string;
  raw: RawPage;
  capture: Decision & {
    timestamp?: string;
    bytes?: number;
    width?: number;
    height?: number;
    performed?: boolean};
  extracted: { product: Product | null; ocr_raw: string | null };
  classification: Record<string, unknown>;
  queries: string[];
  results: Ranked[];
  providers: ProviderResult[];
  storage: Record<string, unknown>;
  discarded: { data: string; reason: string; timestamp: string }[];
  timings: Record<string, number>;
  logs: Stage[];
  resources: Record<string, unknown>;
}
export interface ProviderResult {
  site: string;
  status: 'PASS' | 'PARTIAL' | 'FAIL' | 'BLOCKED' | 'UNSUPPORTED';
  url: string;
  query: string;
  products: Product[];
  error?: string;
  duration_ms: number}
