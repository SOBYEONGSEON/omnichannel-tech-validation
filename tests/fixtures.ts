export const productHtml = (
  name = 'Samsung Galaxy Buds3 Pro',
  price: number | string = 259000,
  extra = ''
) =>
  `<!doctype html><html><head><title>${name} shop</title><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name, brand: { name: 'Samsung' }, model: 'SM-R630', offers: { price, priceCurrency: 'KRW', itemCondition: 'https://schema.org/NewCondition' }, aggregateRating: { ratingValue: 4.7, reviewCount: 120 } })}</script></head><body><main><h1>${name}</h1><p class="price">${price} 원</p><button>Add to cart</button>${extra}</main></body></html>`;
export const cases = [
  {
    id: 'jsonld',
    url: 'https://merchant.example/product/buds',
    html: productHtml(),
    shopping: true,
    capture: true,
    name: 'Samsung Galaxy Buds3 Pro',
    price: 259000,
    brand: 'Samsung',
    category: 'wireless_earbuds'
  },
  {
    id: 'graph',
    url: 'https://merchant.example/product/1',
    html: '<title>Shop</title><script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Raspberry Pi 5","brand":"Raspberry Pi","offers":{"price":80,"priceCurrency":"USD"}}]}</script>',
    shopping: true,
    capture: true,
    name: 'Raspberry Pi 5',
    price: 80,
    brand: 'Raspberry Pi',
    category: 'single_board_computer'
  },
  {
    id: 'meta',
    url: 'https://merchant.example/products/buds',
    html: '<title>Store</title><meta property="og:title" content="Galaxy Buds3 Pro"><meta property="product:price:amount" content="199000"><meta property="product:price:currency" content="KRW"><h1>Galaxy Buds3 Pro</h1><button>구매하기</button>',
    shopping: true,
    capture: true,
    name: 'Galaxy Buds3 Pro',
    price: 199000,
    brand: 'Samsung',
    category: 'wireless_earbuds'
  },
  {
    id: 'dom',
    url: 'https://merchant.example/product/pi',
    html: '<title>Shop</title><h1>Raspberry Pi 5</h1><p class="price">£80.00</p><button>Add to cart</button>',
    shopping: true,
    capture: true,
    name: 'Raspberry Pi 5',
    price: 80,
    brand: 'Raspberry Pi',
    category: 'single_board_computer'
  },
  {
    id: 'malformed-json',
    url: 'https://merchant.example/product/1',
    html: '<title>shop</title><script type="application/ld+json">{broken</script><h1>Galaxy Buds 3 Pro</h1><span class="price">259,000원</span><button>장바구니</button>',
    shopping: true,
    capture: true,
    name: 'Galaxy Buds 3 Pro',
    price: 259000,
    brand: 'Samsung',
    category: 'wireless_earbuds'
  },
  {
    id: 'login',
    url: 'https://merchant.example/login',
    html: productHtml(undefined, 259000, '<input type="password">'),
    shopping: false,
    capture: false
  },
  {
    id: 'checkout',
    url: 'https://merchant.example/checkout',
    html: productHtml(),
    shopping: false,
    capture: false
  },
  {
    id: 'mail',
    url: 'https://mail.example/inbox',
    html: '<title>메일</title><h1>개인 메일</h1><span>259,000원</span>',
    shopping: false,
    capture: false
  },
  {
    id: 'medical',
    url: 'https://hospital.example/medical',
    html: productHtml(),
    shopping: false,
    capture: false
  },
  {
    id: 'private-form',
    url: 'https://merchant.example/product/1',
    html: productHtml(undefined, 259000, '<input autocomplete="cc-number">'),
    shopping: false,
    capture: false
  },
  {
    id: 'empty',
    url: 'https://merchant.example/',
    html: '<html></html>',
    shopping: false,
    capture: false
  },
  {
    id: 'news',
    url: 'https://news.example/article',
    html: '<title>Samsung news</title><h1>Galaxy Buds3 Pro launched</h1><p>가격은 259,000원</p>',
    shopping: false,
    capture: false
  },
  {
    id: 'invalid-price',
    url: 'https://merchant.example/product/buds',
    html: productHtml('Samsung Galaxy Buds3 Pro', -123),
    shopping: true,
    capture: true,
    name: 'Samsung Galaxy Buds3 Pro',
    price: null,
    brand: 'Samsung',
    category: 'wireless_earbuds'
  },
  {
    id: 'review-only',
    url: 'https://blog.example/review',
    html: '<h1>Galaxy Buds Review</h1><p>Great headphones with 4.9 rating</p>',
    shopping: false,
    capture: false
  }
];
