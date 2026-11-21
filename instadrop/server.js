// Instadrop backend: zero dependencies, needs Node 18+. Run: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const RG = require('./regions'), AUTH = require('./auth');
const PORT = process.env.PORT || 3000, DB = path.join(__dirname, 'data.json'), PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
// Set RANGE_CHECK=off to let customers order from any distance (handy for demos). Default: enforce each store's delivery radius.
const REQUIRE_LOGIN = (process.env.REQUIRE_LOGIN || 'off') === 'on'; // REQUIRE_LOGIN=on: guests can browse but must sign in to order
const RANGE_CHECK = (process.env.RANGE_CHECK || 'on') !== 'off';
const RIDER_PIN = process.env.RIDER_PIN || '0000', ADMIN_PIN = process.env.ADMIN_PIN || '9999';
// Mobile money: MOMO_MODE=demo (default, simulated) or MOMO_MODE=mtn (real MTN MoMo Collections API)
const MOMO = {
  mode: process.env.MOMO_MODE || 'demo', base: process.env.MOMO_BASE || 'https://sandbox.momodeveloper.mtn.com',
  env: process.env.MOMO_ENV || 'sandbox', cur: process.env.MOMO_CURRENCY || '',
  key: process.env.MOMO_SUB_KEY, user: process.env.MOMO_API_USER, apikey: process.env.MOMO_API_KEY
};

const STRIPE = process.env.STRIPE_KEY || ''; // set to take real card payments (Stripe Checkout)
const TYPES = ['food', 'grocery', 'drinks', 'household'];
const G = (name, flags, ...ch) => ({ name, req: flags.includes('!'), multi: flags.includes('+'), choices: ch.map(([n, p]) => ({ n, p })) });
// ---------- Countries: currency, phone code, legal drinking age, payment methods ----------
// All prices are stored in the minor unit of the country's currency (cents, pence; whole units for UGX/JPY).
const C = (n, flag, cur, dial, usd, age, city, lat, lng, mm) => ({ n, flag, cur, dial, usd, age, city, lat, lng, pay: mm ? ['Mobile money', 'Card', 'Cash'] : ['Card', 'Cash'] });
const CT = {
  UG: C('Uganda', '🇺🇬', 'UGX', '256', 3700, 18, 'Kampala', 0.3476, 32.5825, 1), KE: C('Kenya', '🇰🇪', 'KES', '254', 129, 18, 'Nairobi', -1.2864, 36.8172, 1),
  TZ: C('Tanzania', '🇹🇿', 'TZS', '255', 2650, 18, 'Dar es Salaam', -6.7924, 39.2083, 1), RW: C('Rwanda', '🇷🇼', 'RWF', '250', 1400, 18, 'Kigali', -1.9441, 30.0619, 1),
  GH: C('Ghana', '🇬🇭', 'GHS', '233', 15, 18, 'Accra', 5.6037, -0.187, 1), NG: C('Nigeria', '🇳🇬', 'NGN', '234', 1550, 18, 'Lagos', 6.5244, 3.3792),
  ZA: C('South Africa', '🇿🇦', 'ZAR', '27', 18, 18, 'Johannesburg', -26.2041, 28.0473), GB: C('United Kingdom', '🇬🇧', 'GBP', '44', 0.78, 18, 'London', 51.5074, -0.1278),
  US: C('United States', '🇺🇸', 'USD', '1', 1, 21, 'New York', 40.7128, -74.006), CA: C('Canada', '🇨🇦', 'CAD', '1', 1.38, 19, 'Toronto', 43.6532, -79.3832),
  AU: C('Australia', '🇦🇺', 'AUD', '61', 1.52, 18, 'Sydney', -33.8688, 151.2093), DE: C('Germany', '🇩🇪', 'EUR', '49', 0.92, 18, 'Berlin', 52.52, 13.405),
  FR: C('France', '🇫🇷', 'EUR', '33', 0.92, 18, 'Paris', 48.8566, 2.3522), IN: C('India', '🇮🇳', 'INR', '91', 83, 21, 'Mumbai', 19.076, 72.8777),
  AE: C('United Arab Emirates', '🇦🇪', 'AED', '971', 3.67, 21, 'Dubai', 25.2048, 55.2708), BR: C('Brazil', '🇧🇷', 'BRL', '55', 5, 18, 'São Paulo', -23.5505, -46.6333),
  MX: C('Mexico', '🇲🇽', 'MXN', '52', 17, 18, 'Mexico City', 19.4326, -99.1332), JP: C('Japan', '🇯🇵', 'JPY', '81', 150, 20, 'Tokyo', 35.6762, 139.6503)
};
for (const c of Object.values(CT)) {
  c.dec = new Intl.NumberFormat('en', { style: 'currency', currency: c.cur }).resolvedOptions().maximumFractionDigits; c.k = 10 ** c.dec;
  const x = 0.27 * c.usd, m = 10 ** Math.floor(Math.log10(x)); c.u = Math.max(1, Math.round(Math.round(x / m) * m * c.k)); // loyalty unit (about US$0.27) in minor units
}
const cOf = v => CT[v.country] || CT.UG;
const nice = (usd, c) => { const v = usd * c.usd; return v >= 1000 ? Math.round(v / 50) * 50 : v >= 100 ? Math.round(v / 5) * 5 : v >= 10 ? Math.round(v) : Math.round(v * 20) / 20; };
// mk: prices are given in major units (e.g. 12.5) and stored in minor units
const mk = (id, type, name, cat, eta, fee, pin, lat, lng, items, cc = 'UG') => { const k = CT[cc].k, sc = p => Math.round(p * k); return {
  id, type, name, cat, eta, fee: sc(fee), pin, lat, lng, country: cc,
  items: items.map((x, i) => ({ id: id + '-' + i, c: x[0], n: x[1], d: x[2], p: sc(x[3]), tags: x[4] || [], alc: !!x[6], opts: (x[5] || []).map(g => ({ ...g, choices: g.choices.map(c => ({ ...c, p: sc(c.p) })) })) }))
}; };
const TPL = [
  ['food', 'Kitchen', 'Local favorites', 25, [['Mains', 'Burger & fries', 'Beef patty, cheese, crispy fries', 9], ['Mains', 'Grilled chicken plate', 'With rice and salad', 11, ['halal']], ['Mains', 'Vegetable curry & rice', 'Mild and fragrant', 8, ['veg', 'vegan']], ['Pizza', 'Margherita pizza', 'Tomato, mozzarella, basil', 12, ['veg']], ['Drinks', 'Fresh fruit juice', 'Seasonal, 500 ml', 3, ['vegan', 'gf']]]],
  ['grocery', 'Fresh Market', 'Supermarket', 40, [['Fresh', 'Tomatoes 1 kg', 'Ripe, local farms', 2.5], ['Fresh', 'Eggs, dozen', 'Free range', 3.5], ['Pantry', 'Rice 2 kg', 'Long grain', 4], ['Dairy', 'Fresh milk 1 L', 'Pasteurised', 1.5], ['Bakery', 'Bread loaf', 'Sliced', 2], ['Pantry', 'Cooking oil 2 L', 'Sunflower', 5]]],
  ['drinks', 'Wine & Spirits', 'Wine & spirits', 35, [['Wine', 'Red wine 750 ml', 'Cabernet Sauvignon', 14, [], [], 1], ['Wine', 'White wine 750 ml', 'Sauvignon Blanc', 13, [], [], 1], ['Wine', 'Sparkling wine 750 ml', 'Brut, served chilled', 18, [], [], 1], ['Spirits', 'Whisky 700 ml', 'Blended, 12 years', 30, [], [], 1], ['Beer', 'Craft beer 6-pack', 'Pale ale, 330 ml', 11, [], [], 1], ['Soft', 'Sparkling water 12-pack', 'Alcohol-free', 6]]],
  ['household', 'Home Store', 'Household', 45, [['Cleaning', 'Dish soap 3 L', 'Lemon fresh', 3], ['Cleaning', 'Laundry detergent 3 L', 'Machine and hand wash', 9], ['Bathroom', 'Toilet paper, 12 rolls', '3-ply', 7], ['Lighting', 'LED bulbs 4-pack', 'Warm white', 8], ['Kitchen', 'Non-stick saucepan set', '3 pieces', 35], ['Bedroom', 'Cotton bed sheet set', 'Queen, 4 pieces', 25]]]
];
const seed = () => {
  const vendors = [
    mk('mama', 'food', 'Mama Rolex', 'Street food', 20, 3000, '1111', 0.3476, 32.6150, [
      ['Mains', 'Chicken rolex', 'Egg, cabbage, tomato, chapati', 6000, ['halal'], [G('Extras', '+', ['Extra egg', 1000], ['Cheese', 1500], ['No chili', 0])]], ['Mains', 'Beef rolex', 'Double egg, grilled beef', 8000],
      ['Mains', 'Kebab skewers x3', 'Charcoal grilled, kachumbari', 9000, ['spicy', 'gf'], [G('Spice', '!', ['Mild', 0], ['Hot', 0])]], ['Drinks', 'Passion juice', 'Fresh, 500 ml', 3000, ['vegan', 'gf'], [G('Size', '!', ['500 ml', 0], ['1 L', 2500])]]]),
    mk('lake', 'food', 'Lake Victoria Grill', 'Local', 35, 4000, '2222', 0.3350, 32.5900, [
      ['Mains', 'Tilapia, whole', 'Fried or grilled, with posho', 28000], ['Mains', 'Luwombo chicken', 'Steamed in banana leaf, rice', 22000],
      ['Sides', 'Matoke & beans', 'Plantain, groundnut sauce', 9000, ['veg', 'vegan', 'gf']], ['Drinks', 'Millet porridge', 'Warm, lightly sweet', 3500]]),
    mk('napoli', 'food', 'Napoli Corner', 'Pizza', 30, 4500, '3333', 0.3365, 32.5870, [
      ['Pizza', 'Margherita', 'Tomato, mozzarella, basil', 24000, ['veg'], [G('Size', '!', ['Medium', 0], ['Large', 8000]), G('Toppings', '+', ['Extra cheese', 3000], ['Olives', 2000], ['Mushrooms', 2500])]], ['Pizza', 'BBQ chicken pizza', 'Smoked sauce, red onion', 32000, [], [G('Size', '!', ['Medium', 0], ['Large', 8000])]],
      ['Sides', 'Garlic bread', 'Eight pieces', 8000], ['Drinks', 'Sparkling water', '500 ml', 3000]]),
    mk('fresh', 'grocery', 'FreshMart Supermarket', 'Supermarket', 45, 5000, '4444', 0.3190, 32.5800, [
      ['Fresh', 'Tomatoes 1 kg', 'Ripe, local farms', 4000], ['Fresh', 'Matoke bunch', 'Medium', 15000], ['Fresh', 'Eggs tray of 30', 'Farm eggs', 13000],
      ['Pantry', 'Rice 2 kg', 'Long grain', 11000], ['Pantry', 'Cooking oil 3 L', 'Sunflower', 24000], ['Household', 'Laundry soap bar', 'Pack of 3', 6000]]),
    mk('green', 'grocery', 'Green Basket Market', 'Fruit & veg', 40, 3500, '5555', 0.3340, 32.5700, [
      ['Fruit', 'Pineapples x2', 'Sweet, ripe', 6000], ['Fruit', 'Bananas bunch', 'Sweet bananas', 5000], ['Veg', 'Sukuma wiki bunch', 'Fresh kale', 2000, ['veg', 'vegan', 'gf']],
      ['Veg', 'Onions 1 kg', 'Red onions', 4500], ['Veg', 'Irish potatoes 2 kg', 'Washed', 7000]]),
    mk('corner', 'grocery', 'Corner Shop Express', 'Essentials', 25, 2500, '6666', 0.3200, 32.6200, [
      ['Drinks', 'Bottled water 1.5 L', 'Pack of 6', 9000], ['Dairy', 'Fresh milk 1 L', 'Pasteurised', 3500], ['Bakery', 'Bread loaf', 'Sliced white', 4500],
      ['Pantry', 'Sugar 1 kg', 'White sugar', 5000], ['Pantry', 'Tea leaves 250 g', 'Black tea', 4000]]),
    mk('cellar', 'drinks', 'The Wine Cellar', 'Wine & spirits', 40, 4000, '7777', 0.3150, 32.5900, [
      ['Wine', 'Cabernet Sauvignon 750 ml', 'Dry red, full body', 45000, [], [], 1], ['Wine', 'Sauvignon Blanc 750 ml', 'Crisp white', 42000, [], [], 1], ['Wine', 'Prosecco 750 ml', 'Sparkling', 55000, [], [], 1],
      ['Spirits', 'Single malt whisky 700 ml', 'Aged 12 years', 95000, [], [], 1], ['Beer', 'Nile Special 6-pack', '500 ml bottles', 18000, [], [], 1], ['Soft', 'Sparkling grape juice', 'Alcohol-free, 750 ml', 12000]]),
    mk('drinkup', 'drinks', 'Chill Drinks Depot', 'Soft drinks & water', 25, 3000, '7778', 0.3300, 32.6000, [
      ['Soft drinks', 'Soda crate 24 x 300 ml', 'Assorted', 38000], ['Water', 'Mineral water 12 x 1.5 L', 'Still', 22000], ['Juice', 'Mango juice 1 L x6', '100% juice', 24000, ['vegan', 'gf']],
      ['Energy', 'Energy drink 4-pack', '250 ml cans', 14000], ['Beer', 'Lager 12-pack', '500 ml cans', 40000, [], [], 1]]),
    mk('homeplus', 'household', 'HomePlus Household', 'Household', 45, 4500, '7779', 0.3250, 32.5750, [
      ['Cleaning', 'Dish soap 5 L', 'Lemon fresh', 18000], ['Cleaning', 'Laundry detergent 3 kg', 'Machine and hand wash', 26000], ['Kitchen', 'Non-stick saucepan set', '3 pieces', 85000],
      ['Bedroom', 'Cotton bed sheet set', 'Queen, 4 pieces', 70000], ['Lighting', 'LED bulbs 4-pack', 'Warm white, 9 W', 16000], ['Bathroom', 'Toilet paper, 12 rolls', '3-ply', 15000]])
  ];
  return { orders: [], vendors };
};

// ---------- Regional demo places ----------
// Every region (state / province) gets restaurants, groceries, drinks and home stores in each of its cities,
// with local dishes and local currency prices. Texas, for example, serves Houston, Dallas, Austin and San Antonio.
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const NAMES = {
  food: ['{c} Kitchen', 'The {c} Table', 'Spice & Smoke {c}', '{c} Street Eats', 'Little {c} Bistro'],
  burger: ['{c} Burger & Pizza Co.', 'Slice & Stack {c}', '{c} Grill House'],
  grocery: ['{c} Fresh Market', '{c} Corner Grocers', 'GreenCart {c}', 'Daily Basket {c}'],
  drinks: ['{c} Wine & Spirits', 'Cork & Cask {c}', '{c} Beverage Depot', 'Cellar 21 {c}'],
  household: ['{c} Home Store', 'HomeHub {c}', '{c} Household Mart', 'Nest & Co. {c}']
};
// Signature local dishes per country, priced in US dollars (converted to local currency when seeding).
const LOCAL = {
  UG: ['Ugandan', [['Mains', 'Chicken rolex', 'Egg, cabbage, tomato, chapati', 1.6, ['halal']], ['Mains', 'Matoke & groundnut sauce', 'Steamed plantain, peanut sauce', 2.4, ['veg', 'vegan']], ['Mains', 'Luwombo chicken', 'Steamed in banana leaf, with rice', 5.5]]],
  KE: ['Kenyan', [['Mains', 'Nyama choma', 'Grilled beef or goat, kachumbari', 8, ['gf']], ['Mains', 'Ugali & sukuma wiki', 'Maize meal, braised kale', 3, ['veg', 'vegan', 'gf']], ['Mains', 'Beef pilau', 'Spiced rice, kachumbari', 5], ['Sides', 'Mandazi', 'Sweet fried dough, 4 pieces', 1.5, ['veg']]]],
  TZ: ['Tanzanian', [['Mains', 'Chipsi mayai', 'Fries cooked in an omelette', 2, ['veg']], ['Mains', 'Ugali na samaki', 'Fried fish with maize meal', 5], ['Mains', 'Pilau na nyama', 'Spiced rice with beef', 4.5]]],
  RW: ['Rwandan', [['Mains', 'Brochettes', 'Grilled goat skewers, plantain', 4, ['gf']], ['Mains', 'Isombe', 'Cassava leaves, aubergine, rice', 3, ['veg', 'vegan']], ['Sides', 'Fried plantain', 'Crispy and sweet', 2, ['veg', 'vegan', 'gf']]]],
  GH: ['Ghanaian', [['Mains', 'Jollof rice & chicken', 'Smoky tomato rice, grilled chicken', 6, ['spicy']], ['Mains', 'Waakye', 'Rice and beans, shito, egg', 4, ['spicy']], ['Mains', 'Banku & tilapia', 'Grilled tilapia, pepper sauce', 7], ['Sides', 'Kelewele', 'Spiced fried plantain', 3, ['veg', 'vegan']]]],
  NG: ['Nigerian', [['Mains', 'Jollof rice & chicken', 'Party-style smoky rice', 7, ['spicy']], ['Mains', 'Suya', 'Spicy grilled beef skewers, onions', 6, ['spicy', 'nuts']], ['Mains', 'Egusi soup & pounded yam', 'Melon seed soup, assorted meat', 8], ['Sides', 'Moi moi', 'Steamed bean pudding', 3, ['veg']]]],
  ZA: ['South African', [['Mains', 'Bunny chow', 'Curry in a hollowed loaf', 6, ['spicy']], ['Mains', 'Braai plate', 'Boerewors, pap and chakalaka', 9], ['Sides', 'Biltong', 'Air-dried beef, 100 g', 5, ['gf']]]],
  GB: ['British', [['Mains', 'Fish & chips', 'Beer-battered cod, mushy peas', 11], ['Mains', 'Sunday roast', 'Roast beef, Yorkshire pudding, gravy', 15], ['Mains', 'Chicken tikka masala', 'With basmati rice', 13, ['halal']], ['Mains', 'Full English breakfast', 'Eggs, bacon, sausage, beans', 10]]],
  US: ['American', [['Mains', 'Classic cheeseburger', 'Beef, cheddar, pickles, fries', 12], ['Mains', 'Mac & cheese', 'Baked, three cheeses', 9, ['veg']], ['Mains', 'Buffalo wings', 'Ten wings, ranch, celery', 11, ['spicy', 'gf']]]],
  CA: ['Canadian', [['Mains', 'Poutine', 'Fries, cheese curds, gravy', 9, ['veg']], ['Mains', 'Peameal bacon sandwich', 'Cornmeal-crusted, on a kaiser', 10], ['Dessert', 'Butter tart', 'Flaky pastry, 2 pieces', 5, ['veg']]]],
  AU: ['Australian', [['Mains', 'Meat pie', 'Beef and gravy, tomato sauce', 6], ['Mains', 'Chicken parma', 'Schnitzel, ham, cheese, chips', 15], ['Mains', 'Barramundi & chips', 'Grilled, lemon, salad', 17, ['gf']]]],
  DE: ['German', [['Mains', 'Currywurst & Pommes', 'Sausage, curry ketchup, fries', 7], ['Mains', 'Schnitzel', 'With potato salad', 15], ['Mains', 'Käsespätzle', 'Cheese noodles, crispy onions', 12, ['veg']]]],
  FR: ['French', [['Mains', 'Steak frites', 'Pepper sauce, hand-cut fries', 18], ['Mains', 'Croque-monsieur', 'Ham, gruyère, béchamel', 9], ['Mains', 'Ratatouille', 'Provençal vegetables', 12, ['veg', 'vegan', 'gf']], ['Dessert', 'Crêpes sucrées', 'Sugar and lemon, 3 pieces', 7, ['veg']]]],
  IN: ['Indian', [['Mains', 'Chicken biryani', 'Dum-cooked basmati, raita', 7, ['halal', 'spicy']], ['Mains', 'Paneer butter masala & naan', 'Creamy tomato gravy', 8, ['veg']], ['Mains', 'Masala dosa', 'Potato filling, sambar, chutney', 5, ['veg', 'vegan']]]],
  AE: ['Middle Eastern', [['Mains', 'Chicken shawarma', 'Garlic sauce, pickles, pita', 6, ['halal']], ['Mains', 'Mixed grill', 'Lamb, chicken, kofta, rice', 20, ['halal']], ['Sides', 'Hummus & pita', 'Chickpea dip, olive oil', 6, ['veg', 'vegan']], ['Sides', 'Falafel', '8 pieces, tahini', 5, ['veg', 'vegan', 'halal']]]],
  BR: ['Brazilian', [['Mains', 'Feijoada', 'Black bean stew, rice, farofa', 12], ['Mains', 'Picanha na chapa', 'Grilled steak, rice, vinaigrette', 16, ['gf']], ['Sides', 'Pão de queijo', 'Cheese bread, 8 pieces', 4, ['veg']]]],
  MX: ['Mexican', [['Mains', 'Tacos al pastor', 'Pork, pineapple, onion, cilantro', 7, ['spicy']], ['Mains', 'Enchiladas verdes', 'Chicken, tomatillo salsa, crema', 9], ['Sides', 'Guacamole & totopos', 'Fresh avocado, lime', 6, ['veg', 'vegan', 'gf']], ['Mains', 'Chilaquiles rojos', 'Egg, salsa, queso fresco', 8, ['veg']]]],
  JP: ['Japanese', [['Mains', 'Tonkotsu ramen', 'Pork broth, chashu, egg', 9], ['Mains', 'Salmon sushi set', '8 pieces plus miso soup', 15], ['Mains', 'Chicken katsu curry', 'Crispy cutlet, Japanese curry', 11], ['Sides', 'Onigiri trio', 'Rice balls, umeboshi, salmon, kombu', 5]]]
};
const LOCAL_REGION = {
  'US-TX': ['Tex-Mex & BBQ', [['Mains', 'Smoked brisket plate', 'Post oak smoked, pickles, white bread', 17, ['gf']], ['Mains', 'Breakfast tacos', 'Egg, potato, chorizo, salsa roja', 8, ['spicy']], ['Sides', 'Queso & chips', 'Chile con queso, tortilla chips', 7, ['veg']], ['Mains', 'Chicken fried steak', 'Cream gravy, mashed potatoes', 15], ['Dessert', 'Pecan pie', 'A Texas classic', 6, ['veg', 'nuts']]]],
  'US-NY': ['New York classics', [['Mains', 'Cheese pizza, whole pie', '18 inch, thin crust', 22, ['veg']], ['Mains', 'Bagel with lox', 'Cream cheese, capers, red onion', 9], ['Mains', 'Pastrami on rye', 'Hand-carved, mustard, pickle', 17]]],
  'US-CA': ['Californian', [['Mains', 'Fish tacos', 'Beer-battered cod, cabbage slaw', 11], ['Mains', 'Avocado toast', 'Sourdough, chili flakes, lime', 9, ['veg', 'vegan']], ['Mains', 'Carne asada burrito', 'Rice, beans, guacamole', 12]]],
  'US-FL': ['Floridian & Cuban', [['Mains', 'Cuban sandwich', 'Roast pork, ham, swiss, pickles', 11], ['Mains', 'Grilled grouper', 'Key lime butter, rice', 21, ['gf']], ['Dessert', 'Key lime pie', 'Graham crust, whipped cream', 6, ['veg']]]],
  'CA-QC': ['Québécois', [['Mains', 'Poutine', 'Fries, cheese curds, gravy', 9, ['veg']], ['Mains', 'Tourtière', 'Spiced pork pie, ketchup aux fruits', 12], ['Mains', 'Smoked meat sandwich', 'Montreal style, mustard, pickle', 12]]]
};
const conv = (items, c) => items.map(x => [x[0], x[1], x[2], nice(x[3], c), x[4], x[5], x[6]]);
function regional(have) {
  const out = [];
  for (const r of RG.ALL) {
    const c = CT[r.cc]; if (!c) continue;
    const [lcat, ldish] = LOCAL_REGION[r.key] || LOCAL[r.cc] || ['Local favorites', []];
    const extras = [['Drinks', 'Fresh fruit juice', 'Seasonal, 500 ml', 3, ['veg', 'vegan', 'gf']], ['Drinks', 'Sparkling water', '500 ml', 2, ['vegan', 'gf']]];
    r.cities.forEach(city => {
      if (r.key === 'UG-C' && city.n === 'Kampala') return; // Kampala already has the hand-made demo places above
      const specs = [['food', lcat, NAMES.food, [...ldish, ...extras], 30], ['food', 'Burgers & pizza', NAMES.burger, TPL[0][4], 25], ['grocery', TPL[1][2], NAMES.grocery, TPL[1][4], 40], ['drinks', TPL[2][2], NAMES.drinks, TPL[2][4], 35], ['household', TPL[3][2], NAMES.household, TPL[3][4], 45]];
      specs.forEach(([type, cat, names, items, eta], k) => {
        const id = (r.cc + '_' + r.id + '_' + city.n + '_' + k).toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (have.has(id)) return;
        const j = s => ((hash(id + s) % 1000) / 1000 - 0.5) * 0.06; // scatter places within about 3 km of the city centre
        const v = mk(id, type, names[hash(id) % names.length].replace('{c}', city.n), cat, eta + (hash(id + 'e') % 11) - 4, nice(2.5, c), String(1000 + hash(id + 'p') % 9000),
          +(city.lat + j('a')).toFixed(5), +(city.lng + j('b')).toFixed(5), conv(items, c), r.cc);
        v.region = r.key; v.city = city.n; v.radius = 15; out.push(v);
      });
    });
  }
  return out;
}

// ---------- Storage (saves are batched, written atomically) ----------
let db, saveTimer = null;
function writeNow() { try { fs.writeFileSync(DB + '.tmp', JSON.stringify(db)); fs.renameSync(DB + '.tmp', DB); } catch (e) { console.error('Could not save data:', e.message); } saveTimer = null; }
// With DATABASE_URL set, every change is written through to PostgreSQL (appdb.js); otherwise data.json is used.
const APPDB = process.env.DATABASE_URL ? require('./appdb')(AUTH.store.pool) : null;
function save(o) {
  if (o && o.id) notify(o);
  if (APPDB) { if (o && o.id) APPDB.queueOrder(o); APPDB.queueRest(); return; }
  if (!saveTimer) saveTimer = setTimeout(writeNow, 120);
}
process.on('exit', () => { if (saveTimer) writeNow(); });
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, async () => { try { if (APPDB) await APPDB.flush(); await AUTH.flush(); } catch (e) { console.error(e.message); } process.exit(0); }));

// ---------- Live updates (Server-Sent Events) ----------
// Customers subscribe to one order and receive it whenever it changes (status, payment, rider position).
// Kitchens and riders get a small "changed" ping and then re-load their own list with their PIN.
const subs = new Map(); // channel -> Set of responses
function sse(req, res, channel, first) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write('retry: 2000\n\n'); if (first !== undefined) res.write('data: ' + JSON.stringify(first) + '\n\n');
  if (!subs.has(channel)) subs.set(channel, new Set()); subs.get(channel).add(res);
  const hb = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(hb); const s = subs.get(channel); if (s) { s.delete(res); if (!s.size) subs.delete(channel); } });
}
function emit(channel, data) { const s = subs.get(channel); if (s) for (const r of s) r.write('data: ' + JSON.stringify(data) + '\n\n'); }
function notify(o) { emit('order:' + o.id, pubOrder(o)); emit('vendor:' + o.vendorId, { changed: o.id }); emit('riders', { changed: o.id, region: o.region }); }
const pubOrder = (o, withToken) => { if (withToken) return o; const { ctoken, ...rest } = o; return rest; };

async function loadData() {
  if (APPDB) {
    await APPDB.init(); db = await APPDB.load(); if (db) { APPDB.attach(db); return false; }
    db = APPDB.importFile(DB); const imported = !!db; if (!db) db = seed(); APPDB.attach(db); console.log('[db] empty database: ' + (imported ? 'importing data.json' : 'loading demo data')); return true;
  }
  try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); return false; } catch { db = seed(); return true; }
}
function migrate(fresh) {
  db.orders = db.orders || []; let dirty = fresh;
  for (const v of db.vendors) {
    v.country = v.country || 'UG'; v.radius = v.radius || 15;
    if (!v.region) { // data from an older version: put each place in the region whose city is closest
      const list = RG.REGIONS[v.country] || []; let best = null;
      for (const r of list) for (const ci of r.cities) { const d = RG.km(v.lat, v.lng, ci.lat, ci.lng); if (!best || d < best.d) best = { d, r, ci }; }
      if (best) { v.region = best.r.key; v.city = best.ci.n; } dirty = true;
    }
  }
  if (db.seeded !== 3) { db.vendors.push(...regional(new Set(db.vendors.map(v => v.id)))); db.seeded = 3; dirty = true; }
  if (dirty) save();
}

// ---------- Order lookups ----------
// Orders are found through a Map (constant time) instead of scanning the whole list, and tracked by owner for signed-in customers.
const orderIdx = new Map(), userOrders = new Map();
function indexOrder(o) { orderIdx.set(o.id, o); if (o.userId) { if (!userOrders.has(o.userId)) userOrders.set(o.userId, []); userOrders.get(o.userId).push(o.id); } }
const ordr = id => orderIdx.get(id);
const ID32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newOrderId = () => { let id; do id = 'ID-' + Array.from(crypto.randomBytes(8), x => ID32[x % 31]).join(''); while (orderIdx.has(id)); return id; };
// An order is private to the device that placed it (secret token) and to the signed-in account that owns it.
function canSee(o, req, q) {
  if (!o.ctoken) return true; const t = String(req.headers['x-token'] || q.get('t') || '');
  if (t.length === o.ctoken.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(o.ctoken))) return true;
  const u = AUTH.user(req); return !!(u && o.userId && u.sub === o.userId);
}

const PROMOS = { DROP10: 0.1 };
const FREE_SVC = 30; // no service fee at or above this many loyalty units (about US$8)
const SERVICE = 0.05; // service fee, 5% of subtotal (waived on nothing; shown at checkout)
const FLOW = {
  vendor: { placed: ['accepted', 'rejected'], accepted: ['preparing'], preparing: ['ready'] },
  rider: { ready: ['onway'], onway: ['delivered'] }
};
const EMO = [[/wine|spirit|beer|liquor/, '🍷'], [/tex-mex|bbq|smoke/, '🍖'], [/mexican|taco/, '🌮'], [/japan|sushi|ramen/, '🍣'], [/indian|biryani/, '🍛'], [/burger|american/, '🍔'], [/french|québécois|canadian/, '🥐'], [/middle eastern|shawarma/, '🥙'], [/brazil/, '🥩'], [/german/, '🥨'], [/british|fish/, '🍟'], [/cuban|florid|californ|new york/, '🥪'], [/kenyan|nigerian|ghanaian|tanzanian|rwandan|ugandan|south african|australian/, '🍲'], [/pizza/, '🍕'], [/rolex|street/, '🌯'], [/local|grill/, '🍗'], [/soft|water|juice|drink/, '🥤'], [/household|clean|home/, '🏠'], [/super/, '🛒'], [/fruit|veg/, '🥬'], [/essential/, '🧴']];
const hs = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pub = v => ({ id: v.id, type: v.type, name: v.name, cat: v.cat, eta: v.eta, fee: v.fee, lat: v.lat, lng: v.lng, img: v.img || '',
  country: v.country || 'UG', region: v.region || '', city: v.city || '', radius: v.radius || 15, tags: [...new Set(v.items.flatMap(i => i.tags || []))], cur: cOf(v).cur, alcohol: v.items.some(i => i.alc), kw: v.items.map(i => i.n).join(' ').toLowerCase(),
  emoji: v.emoji || (EMO.find(([r]) => r.test((v.cat + ' ' + v.name).toLowerCase())) || [0, { food: '🍽️', grocery: '🛒', drinks: '🥤', household: '🏠' }[v.type] || '🛍️'])[1],
  rating: +(((4.2 + (hs(v.id) % 8) / 10) * (100 + hs(v.id) % 900) + (v.rsum || 0)) / (100 + hs(v.id) % 900 + (v.rcount || 0))).toFixed(1), reviews: 100 + hs(v.id) % 900 + (v.rcount || 0) });
const send = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
const fail = (res, code, error, extra) => send(res, code, { error, ...extra });
const clean = s => String(s || '').trim().slice(0, 200);
const num = x => (typeof x === 'number' && isFinite(x) ? x : null);
const visibleToVendor = o => o.payStatus === 'paid' || o.payStatus === 'cash';
const lp = (ph, dial) => { db.loyalty = db.loyalty || {}; const k = msisdn(ph, dial); if (APPDB) APPDB.touch('loyalty', k); return db.loyalty[k] = db.loyalty[k] || { pts: 0, life: 0 }; };
const tierOf = l => l >= 1000 ? 'Gold' : l >= 300 ? 'Silver' : 'Bronze'; // Gold: free delivery. 1 point per local loyalty unit (about US$0.27); 100 points = 5 units off
const bad = m => Object.assign(new Error(m), { bad: true });
const TAGS = ['veg', 'vegan', 'gf', 'halal', 'spicy', 'nuts'];
const parseOpts = (t, k = 1) => String(t || '').split('\n').map(l => { const m = l.match(/^\s*([^:!+]+)([!+]*)\s*:\s*(.+)$/); if (!m) return null;
  const choices = m[3].split(',').map(c => { const [n, p] = c.split('='); return n && n.trim() ? { n: n.trim().slice(0, 40), p: Math.max(0, Math.round((+p || 0) * k)) } : null; }).filter(Boolean);
  return choices.length ? { name: m[1].trim().slice(0, 30), req: m[2].includes('!'), multi: m[2].includes('+'), choices } : null; }).filter(Boolean).slice(0, 5);
function buildLines(v, items, allowEmpty) {
  const out = [];
  for (const it of items || []) {
    const x = v.items.find(i => i.id === it.id), q = Math.floor(it.q);
    if (!x || !(q > 0 && q <= 20)) continue;
    let extra = 0; const labels = [], sel = (it.sel || []).map(String);
    for (const g of x.opts || []) {
      const ch = g.choices.filter(c => sel.includes(g.name + ':' + c.n));
      if (g.req && !ch.length) throw bad('Choose ' + g.name + ' for ' + x.n);
      if (!g.multi && ch.length > 1) throw bad('Choose only one ' + g.name);
      ch.forEach(c => { extra += c.p; labels.push(c.n); });
    }
    out.push({ alc: !!x.alc, id: x.id, n: x.n + (labels.length ? ' (' + labels.join(', ') + ')' : ''), p: x.p + extra, q, note: clean(it.note).slice(0, 80) });
  }
  if (!out.length && !allowEmpty) throw bad('Your cart is empty');
  return out;
}

// ---------- Mobile money ----------
const msisdn = (s, dial = '256') => { s = String(s || '').trim(); const intl = /^(\+|00)/.test(s); s = s.replace(/\D/g, ''); if (/^00/.test(s)) s = s.slice(2); return intl ? s : s.startsWith('0') ? dial + s.slice(1) : s.startsWith(dial) ? s : dial + s; };
async function momoToken() {
  const r = await fetch(MOMO.base + '/collection/token/', { method: 'POST', headers: {
    Authorization: 'Basic ' + Buffer.from(MOMO.user + ':' + MOMO.apikey).toString('base64'), 'Ocp-Apim-Subscription-Key': MOMO.key } });
  if (!r.ok) throw new Error('Mobile money provider rejected our credentials');
  return (await r.json()).access_token;
}
const markPaid = o => { o.payStatus = 'paid'; o.log.push(['paid', Date.now()]); save(o); };
async function startPayment(o, phone, origin) {
  const cf = CT[o.country] || CT.UG;
  o.payUrl = null;
  if (o.pay === 'Card') {
    o.payStatus = 'pending';
    if (STRIPE) { // Stripe Checkout (untested against Stripe's servers: try it with a test key first)
      const f = new URLSearchParams({ mode: 'payment', success_url: origin + '/?paid=' + o.id + '&t=' + o.ctoken, cancel_url: origin + '/?paid=' + o.id + '&t=' + o.ctoken, client_reference_id: o.id,
        'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': o.cur.toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(o.cur === 'UGX' ? o.total * 100 : o.total), 'line_items[0][price_data][product_data][name]': 'Instadrop order ' + o.id });
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + STRIPE, 'content-type': 'application/x-www-form-urlencoded' }, body: f }), j = await r.json();
      if (!r.ok) { o.payStatus = 'failed'; save(o); throw new Error('Could not start the card payment. Try again.'); }
      o.payRef = j.id; o.payUrl = j.url;
    } else setTimeout(() => markPaid(o), 4000); // demo: card approved after 4 seconds
    save(o); return;
  }
  const n = msisdn(phone, cf.dial);
  if (!/^\d{8,15}$/.test(n)) throw new Error('Enter a valid mobile money number, with country code if it is not a local number');
  o.payStatus = 'pending'; o.momo = n;
  if (MOMO.mode === 'mtn') {
    const token = await momoToken(), ref = crypto.randomUUID();
    const r = await fetch(MOMO.base + '/collection/v1_0/requesttopay', { method: 'POST', headers: {
      Authorization: 'Bearer ' + token, 'X-Reference-Id': ref, 'X-Target-Environment': MOMO.env,
      'Ocp-Apim-Subscription-Key': MOMO.key, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: String(o.total / cf.k), currency: MOMO.cur || (MOMO.env === 'sandbox' ? 'EUR' : o.cur), externalId: o.id, payer: { partyIdType: 'MSISDN', partyId: n },
        payerMessage: 'Instadrop ' + o.id, payeeNote: o.vendor }) });
    if (r.status !== 202) { o.payStatus = 'failed'; save(o); throw new Error('Could not start the payment. Try again.'); }
    o.payRef = ref;
  } else {
    // Demo: approves after 5 seconds. A number ending in 00 simulates a declined payment.
    setTimeout(() => { if (n.endsWith('00')) { o.payStatus = 'failed'; o.log.push(['payment_failed', Date.now()]); save(o); } else markPaid(o); }, 5000);
  }
  save(o);
}
async function refreshPayment(o) {
  if (o.payStatus !== 'pending' || !o.payRef) return;
  try {
    if (o.pay === 'Card') {
      const j = await (await fetch('https://api.stripe.com/v1/checkout/sessions/' + o.payRef, { headers: { Authorization: 'Bearer ' + STRIPE } })).json();
      if (j.payment_status === 'paid') markPaid(o); else if (j.status === 'expired') { o.payStatus = 'failed'; save(o); }
      return;
    }
    if (MOMO.mode !== 'mtn') return;
    const token = await momoToken();
    const r = await fetch(MOMO.base + '/collection/v1_0/requesttopay/' + o.payRef, { headers: {
      Authorization: 'Bearer ' + token, 'X-Target-Environment': MOMO.env, 'Ocp-Apim-Subscription-Key': MOMO.key } });
    const st = (await r.json()).status;
    if (st === 'SUCCESSFUL') markPaid(o); else if (st === 'FAILED') { o.payStatus = 'failed'; save(o); }
  } catch { /* keep pending, try again on next poll */ }
}

// ---------- Routes ----------
async function route(req, res, p, m, b) {
  const h = req.headers;
  if (!p.startsWith('/api')) {
    let rel = decodeURIComponent(p); if (rel === '/') rel = '/index.html';
    const f = path.normalize(path.join(PUB, rel));
    if (!f.startsWith(PUB + path.sep)) return fail(res, 403, 'Forbidden');
    const ext = path.extname(f), file = fs.existsSync(f) && fs.statSync(f).isFile() ? f : ext ? null : path.join(PUB, 'index.html'); // unknown paths without an extension open the app
    if (!file) return fail(res, 404, 'Not found');
    return fs.readFile(file, (e, d) => {
      if (e) return fail(res, 404, 'Not found');
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(d);
    });
  }
  let r; const origin = (h['x-forwarded-proto'] || 'http') + '://' + h.host;
  const q = new URL(req.url, 'http://x').searchParams;
  if (m === 'GET' && p === '/api/health') return send(res, 200, { ok: true, uptime: Math.round(process.uptime()) }); // for the load balancer's health checks
  if (p.startsWith('/api/auth/') && await AUTH.handle(req, res, p, m, b, { send, fail })) return;
  if (m === 'GET' && p === '/api/me/orders') { // everything this account ordered, from any device
    const u = AUTH.user(req); if (!u) return fail(res, 401, 'Please sign in', { code: 'auth' });
    return send(res, 200, (userOrders.get(u.sub) || []).slice(-100).reverse().map(id => pubOrder(ordr(id), true)));
  }
  if (m === 'GET' && p === '/api/countries') {
    const count = {}; for (const v of db.vendors) count[v.region] = (count[v.region] || 0) + 1;
    return send(res, 200, Object.entries(CT).map(([code, c]) => ({ code, ...c, langs: RG.LANGS[code] || ['en'],
      regions: (RG.REGIONS[code] || []).map(r => ({ key: r.key, n: r.n, lat: r.lat, lng: r.lng, lang: r.lang, cities: r.cities, count: count[r.key] || 0 })) })));
  }
  if (m === 'GET' && p === '/api/geo') { // which region serves this position?
    const lat = +q.get('lat'), lng = +q.get('lng'); if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail(res, 400, 'Bad position');
    return send(res, 200, RG.nearest(lat, lng) || { region: null });
  }
  if (m === 'GET' && p === '/api/vendors') { // ?cc=US&region=US-TX narrows the list to places that serve that region
    const cc = q.get('cc'), rg = q.get('region');
    return send(res, 200, db.vendors.filter(v => (!cc || v.country === cc) && (!rg || v.region === rg)).map(pub));
  }
  if (m === 'GET' && (r = p.match(/^\/api\/stream\/order\/([\w-]+)$/))) {
    const o = ordr(r[1]); if (!o || !canSee(o, req, q)) return fail(res, 404, 'Order not found');
    return sse(req, res, 'order:' + o.id, pubOrder(o));
  }
  if (m === 'GET' && (r = p.match(/^\/api\/stream\/vendor\/(\w+)$/))) return sse(req, res, 'vendor:' + r[1], { ready: 1 });
  if (m === 'GET' && p === '/api/stream/riders') return sse(req, res, 'riders', { ready: 1 });
  if (m === 'GET' && (r = p.match(/^\/api\/vendors\/(\w+)$/))) {
    const v = db.vendors.find(x => x.id === r[1]);
    return v ? send(res, 200, { ...pub(v), items: v.items }) : fail(res, 404, 'Vendor not found');
  }
  if (m === 'GET' && (r = p.match(/^\/api\/loyalty\/([^/]+)$/))) {
    const ph = decodeURIComponent(r[1]), dl = (CT[new URL(req.url, 'http://x').searchParams.get('c')] || CT.UG).dial; if (!/^\d{8,15}$/.test(msisdn(ph, dl))) return fail(res, 400, 'Bad phone number');
    const a = lp(ph, dl); return send(res, 200, { pts: a.pts, life: a.life, tier: tierOf(a.life) });
  }
  if (m === 'POST' && p === '/api/groups') {
    const v = db.vendors.find(x => x.id === b.vendorId); if (!v) return fail(res, 400, 'Unknown restaurant or store');
    db.groups = db.groups || {}; let code;
    do code = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.random() * 31 | 0]).join(''); while (db.groups[code]);
    db.groups[code] = { vid: v.id, lines: [], at: Date.now() }; if (APPDB) APPDB.touch('group', code); save(); return send(res, 201, { code, vid: v.id });
  }
  if (m === 'GET' && (r = p.match(/^\/api\/groups\/(\w+)$/))) { const g = (db.groups || {})[r[1].toUpperCase()]; return g ? send(res, 200, g) : fail(res, 404, 'Group not found'); }
  if (m === 'PUT' && (r = p.match(/^\/api\/groups\/(\w+)\/lines$/))) {
    const g = (db.groups || {})[r[1].toUpperCase()]; if (!g) return fail(res, 404, 'Group not found');
    const who = clean(b.who).slice(0, 30) || 'Guest', v = db.vendors.find(x => x.id === g.vid);
    g.lines = g.lines.filter(l => l.who !== who).concat(buildLines(v, b.items, true).map(l => ({ ...l, who }))); if (APPDB) APPDB.touch('group', r[1].toUpperCase()); save(); return send(res, 200, g);
  }
  if (m === 'POST' && p === '/api/orders') {
    const v = db.vendors.find(x => x.id === b.vendorId);
    if (!v) return fail(res, 400, 'Unknown restaurant or store');
    const au = AUTH.user(req); if (REQUIRE_LOGIN && !au) return fail(res, 401, 'Please sign in to order', { code: 'auth' });
    if (!AUTH.limiter.hit('ord:' + AUTH.ipOf(req), 40, 600000).ok) return fail(res, 429, 'Too many orders from this network. Try again in a few minutes', { code: 'rate' });
    const cf = cOf(v), pickup = b.mode === 'pickup', name = clean(b.name), phone = clean(b.phone), address = pickup ? 'Pickup at ' + v.name : clean(b.address);
    if (!name || !address || !/^[+\d][\d\s-]{7,}$/.test(phone)) return fail(res, 400, 'Enter your name, a valid phone number and delivery address');
    const lines = buildLines(v, b.items, !!b.group);
    const gk = String(b.group || '').toUpperCase(), grp = gk && db.groups && db.groups[gk];
    if (grp && grp.vid === v.id) lines.push(...grp.lines.filter(l => l.who !== clean(b.who)));
    if (!lines.length) return fail(res, 400, 'Your cart is empty');
    const clat = num(b.lat), clng = num(b.lng);
    if (RANGE_CHECK && !pickup && clat !== null && clng !== null) { // the customer's live position must be inside this place's delivery radius
      const away = RG.km(clat, clng, v.lat, v.lng), max = v.radius || 15;
      if (away > max) return fail(res, 400, v.name + ' delivers within ' + max + ' km. You are about ' + Math.round(away) + ' km away. Pick a closer place or change your region.', { code: 'range', km: Math.round(away), max });
    }
    const hasAlc = lines.some(l => l.alc);
    if (hasAlc && !b.ageOk) return fail(res, 400, 'Please confirm you are ' + cf.age + ' or older to order alcohol');
    const sub = lines.reduce((a, l) => a + l.p * l.q, 0);
    const code = String(b.promo || '').toUpperCase().trim();
    if (code && !PROMOS[code]) return fail(res, 400, 'That promo code is not valid');
    const discount = Math.round(sub * (PROMOS[code] || 0));
    const sched = +b.sched > Date.now() && +b.sched < Date.now() + 48 * 36e5 ? Math.round(+b.sched) : null;
    const acct = lp(phone, cf.dial), pm = cf.pay.includes(b.pay) ? b.pay : cf.pay[0], cash = pm === 'Cash', fee = pickup || tierOf(acct.life) === 'Gold' ? 0 : v.fee, redeemed = b.redeem && acct.pts >= 100 && sub >= 5 * cf.u ? 5 * cf.u : 0, service = sub >= FREE_SVC * cf.u ? 0 : Math.round(sub * SERVICE), tip = pickup ? 0 : Math.min(Math.max(0, Math.round(+b.tip || 0)), sub);
    const o = {
      id: newOrderId(), userId: au ? au.sub : null, vendorId: v.id, vendor: v.name, type: v.type, vlat: v.lat, vlng: v.lng,
      lines, sub, fee, service, tip, redeemed, mode: pickup ? 'pickup' : 'delivery', discount, total: sub + fee + service + tip - discount - redeemed, name, phone, address, lat: clat, lng: clng,
      country: v.country || 'UG', region: v.region || '', city: v.city || '', ctoken: crypto.randomUUID(), cloc: null, trail: [], cur: cf.cur, dial: cf.dial, age: hasAlc ? cf.age : 0, pay: pm, payStatus: cash ? 'cash' : 'unpaid', note: clean(b.note), subPref: ['refund', 'substitute', 'call'].includes(b.subPref) ? b.subPref : 'refund', sched, status: 'placed', rider: null,
      loc: null, at: Date.now(), log: [['placed', Date.now()]]
    };
    if (redeemed) acct.pts -= 100;
    if (grp && grp.vid === v.id) delete db.groups[gk];
    db.orders.push(o); indexOrder(o); save(o);
    return send(res, 201, pubOrder(o, true));
  }
  if (m === 'POST' && (r = p.match(/^\/api\/orders\/([\w-]+)\/pay$/))) {
    const o = ordr(r[1]);
    if (!o || !canSee(o, req, q)) return fail(res, 404, 'Order not found');
    if (o.pay === 'Card' && o.payStatus === 'pending' && o.payUrl) return send(res, 200, pubOrder(o));
    if (!['Mobile money', 'Card'].includes(o.pay) || o.payStatus === 'paid' || o.payStatus === 'pending') return fail(res, 409, 'This order does not need a payment');
    await startPayment(o, b.momo || o.phone, origin);
    return send(res, 200, pubOrder(o));
  }
  if (m === 'POST' && (r = p.match(/^\/api\/orders\/([\w-]+)\/issue$/))) {
    const o = ordr(r[1]), why = clean(b.reason);
    if (!o || !canSee(o, req, q)) return fail(res, 404, 'Order not found');
    if (o.issue) return fail(res, 409, 'We already have a report for this order');
    if (!['Missing item', 'Wrong order', 'Cold or spoiled food', 'Very late', 'Other'].includes(why)) return fail(res, 400, 'Choose a reason');
    o.issue = { why, at: Date.now() }; o.log.push(['issue', Date.now()]); save(o); return send(res, 200, pubOrder(o));
  }
  if (m === 'POST' && (r = p.match(/^\/api\/orders\/([\w-]+)\/rate$/))) {
    const o = ordr(r[1]), st = Math.round(+b.stars);
    if (!o || !canSee(o, req, q)) return fail(res, 404, 'Order not found');
    if (o.status !== 'delivered' || o.rating) return fail(res, 409, 'This order cannot be rated');
    if (!(st >= 1 && st <= 5)) return fail(res, 400, 'Pick 1 to 5 stars');
    const v = db.vendors.find(x => x.id === o.vendorId);
    o.rating = st; if (v) { v.rsum = (v.rsum || 0) + st; v.rcount = (v.rcount || 0) + 1; }
    save(o); return send(res, 200, pubOrder(o));
  }
  if (m === 'POST' && (r = p.match(/^\/api\/orders\/([\w-]+)\/location$/))) {
    const o = ordr(r[1]), name = clean(h['x-rider']);
    if (!o || h['x-pin'] !== RIDER_PIN || o.rider !== name || o.status !== 'onway') return fail(res, 401, 'Not allowed');
    if (num(b.lat) === null || num(b.lng) === null) return fail(res, 400, 'Bad location');
    o.loc = { lat: b.lat, lng: b.lng, t: Date.now() }; (o.trail = o.trail || []).push([+b.lat.toFixed(5), +b.lng.toFixed(5)]); if (o.trail.length > 80) o.trail.shift(); save(o);
    return send(res, 200, { ok: true });
  }
  if (m === 'POST' && (r = p.match(/^\/api\/orders\/([\w-]+)\/customer-location$/))) {
    const o = ordr(r[1]);
    if (!o || h['x-token'] !== o.ctoken) return fail(res, 401, 'Not allowed');
    if (b.stop) { o.cloc = null; save(o); return send(res, 200, { ok: true }); }
    if (num(b.lat) === null || num(b.lng) === null) return fail(res, 400, 'Bad location');
    o.cloc = { lat: b.lat, lng: b.lng, t: Date.now() }; save(o); return send(res, 200, { ok: true });
  }
  if (m === 'GET' && (r = p.match(/^\/api\/orders\/([\w-]+)$/))) {
    const o = ordr(r[1]);
    if (!o || !canSee(o, req, q)) return fail(res, 404, 'Order not found');
    await refreshPayment(o);
    return send(res, 200, pubOrder(o));
  }
  if (m === 'GET' && p === '/api/vendor-orders') {
    const v = db.vendors.find(x => x.id === h['x-vendor']);
    if (!v || v.pin !== h['x-pin']) return fail(res, 401, 'Wrong vendor PIN');
    return send(res, 200, db.orders.filter(o => o.vendorId === v.id && visibleToVendor(o)).slice().reverse().map(pubOrder));
  }
  if (m === 'GET' && p === '/api/rider-orders') {
    if (h['x-pin'] !== RIDER_PIN) return fail(res, 401, 'Wrong rider PIN');
    const me = clean(h['x-rider']), rg = q.get('region');
    return send(res, 200, db.orders.filter(o => (!rg || o.region === rg) && (o.status === 'ready' && o.mode !== 'pickup' && visibleToVendor(o)) || (o.rider === me && ['onway', 'delivered'].includes(o.status))).reverse().map(pubOrder));
  }
  if (m === 'PATCH' && (r = p.match(/^\/api\/orders\/([\w-]+)$/))) {
    const o = ordr(r[1]);
    if (!o) return fail(res, 404, 'Order not found');
    let role;
    const v = db.vendors.find(x => x.id === h['x-vendor']);
    if (v && v.pin === h['x-pin'] && o.vendorId === v.id) role = 'vendor';
    else if (!h['x-vendor'] && h['x-pin'] === RIDER_PIN) role = 'rider';
    if (!role) return fail(res, 401, 'Not allowed');
    const allowed = role === 'vendor' && o.mode === 'pickup' && o.status === 'ready' ? ['delivered'] : (FLOW[role][o.status] || []);
    if (!allowed.includes(b.status)) return fail(res, 409, 'Cannot move order from ' + o.status + ' to ' + b.status);
    if (role === 'rider') { o.rider = clean(h['x-rider']) || 'Rider'; if (b.status === 'onway') o.loc = { lat: o.vlat, lng: o.vlng, t: Date.now() }; }
    if (b.status === 'delivered' && o.mode !== 'pickup') { const v2 = db.vendors.find(x => x.id === o.vendorId); if (Date.now() > (o.sched || o.at) + ((v2 ? v2.eta : 30) + 15) * 60000) o.refund = o.fee; } // on-time promise
    if (b.status === 'rejected' && o.redeemed) lp(o.phone, o.dial).pts += 100;
    if (b.status === 'delivered') { const a = lp(o.phone, o.dial), e = Math.floor(o.total / (CT[o.country] || CT.UG).u); a.pts += e; a.life += e; o.earned = e; }
    o.status = b.status; o.log.push([b.status, Date.now()]); save(o);
    return send(res, 200, pubOrder(o));
  }

  // ---------- Admin ----------
  if (p.startsWith('/api/admin')) {
    if (h['x-admin'] !== ADMIN_PIN) return fail(res, 401, 'Wrong admin PIN');
    if (m === 'GET' && p === '/api/admin/overview') {
      const done = db.orders.filter(o => o.status === 'delivered');
      const fc = q.get('cc'), fr = q.get('region');
      return send(res, 200, { vendors: db.vendors.filter(v => (!fc || v.country === fc) && (!fr || v.region === fr)).map(v => ({ ...v, cur: cOf(v).cur })), stats: { orders: db.orders.length, delivered: done.length, revenue: done.reduce((a, o) => { const c = o.cur || 'UGX'; a[c] = (a[c] || 0) + o.total; return a; }, {}) } });
    }
    if (m === 'POST' && p === '/api/admin/vendors') {
      const name = clean(b.name); if (!name) return fail(res, 400, 'Enter a name');
      let id = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'v'; while (db.vendors.some(v => v.id === id)) id += Math.floor(Math.random() * 10);
      const cc = CT[b.country] ? b.country : 'UG', cf = CT[cc];
      const rg = RG.BY_KEY[b.region] && RG.BY_KEY[b.region].cc === cc ? RG.BY_KEY[b.region] : (RG.REGIONS[cc] || [])[0], city = rg && (rg.cities.find(c => c.n === b.city) || rg.cities[0]);
      db.vendors.push({ id, type: TYPES.includes(b.type) ? b.type : 'food', name, cat: clean(b.cat) || 'General', eta: Math.max(5, +b.eta || 30), country: cc,
        fee: Math.max(0, Math.round((+b.fee || nice(2.5, cf)) * cf.k)), pin: clean(b.pin) || String(Math.floor(1000 + Math.random() * 9000)), lat: num(b.lat) ?? (city ? city.lat : cf.lat), lng: num(b.lng) ?? (city ? city.lng : cf.lng), region: rg ? rg.key : '', city: city ? city.n : '', radius: Math.max(1, +b.radius || 15), items: [] });
      save(); return send(res, 201, { id });
    }
    if ((r = p.match(/^\/api\/admin\/vendors\/(\w+)$/))) {
      const i = db.vendors.findIndex(x => x.id === r[1]); if (i < 0) return fail(res, 404, 'Vendor not found');
      if (m === 'DELETE') { db.vendors.splice(i, 1); save(); return send(res, 200, { ok: true }); }
      if (m === 'PUT') {
        const v = db.vendors[i];
        for (const k of ['name', 'cat', 'pin']) if (b[k] !== undefined) v[k] = clean(b[k]) || v[k];
        if (b.eta !== undefined && +b.eta >= 0) v.eta = +b.eta; if (b.fee !== undefined && +b.fee >= 0) v.fee = Math.round(+b.fee * cOf(v).k);
        if (TYPES.includes(b.type)) v.type = b.type;
        if (b.img !== undefined) v.img = /^https?:\/\/\S+$/.test(clean(b.img)) ? clean(b.img) : '';
        save(); return send(res, 200, v);
      }
    }
    if (m === 'POST' && (r = p.match(/^\/api\/admin\/vendors\/(\w+)\/items$/))) {
      const v = db.vendors.find(x => x.id === r[1]); if (!v) return fail(res, 404, 'Vendor not found');
      const k = cOf(v).k, n = clean(b.n), price = Math.round(+b.p * k); if (!n || !(price > 0)) return fail(res, 400, 'Enter an item name and a price');
      v.items.push({ id: v.id + '-' + Date.now().toString(36), c: clean(b.c) || 'Items', n, d: clean(b.d), p: price,
        tags: String(b.t || '').toLowerCase().split(/[\s,]+/).filter(t => TAGS.includes(t)), alc: !!b.alc, opts: parseOpts(b.o, k), img: /^https?:\/\/\S+$/.test(clean(b.img)) ? clean(b.img) : '' }); save();
      return send(res, 201, v);
    }
    if (m === 'DELETE' && (r = p.match(/^\/api\/admin\/vendors\/(\w+)\/items\/([\w-]+)$/))) {
      const v = db.vendors.find(x => x.id === r[1]); if (!v) return fail(res, 404, 'Vendor not found');
      v.items = v.items.filter(i => i.id !== r[2]); save(); return send(res, 200, v);
    }
  }
  fail(res, 404, 'Not found');
}

const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname; let b = '';
  res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('x-frame-options', 'DENY'); res.setHeader('referrer-policy', 'strict-origin-when-cross-origin'); res.setHeader('permissions-policy', 'geolocation=(self), camera=(), microphone=()');
  if ((req.headers['x-forwarded-proto'] || '') === 'https') res.setHeader('strict-transport-security', 'max-age=31536000');
  if (p.startsWith('/api/') && !p.startsWith('/api/stream/') && p !== '/api/health' && !AUTH.limiter.hit('api:' + AUTH.ipOf(req), 1500, 60000).ok) { res.setHeader('retry-after', '30'); return fail(res, 429, 'Too many requests. Slow down a little', { code: 'rate' }); }
  req.on('data', d => { b += d; if (b.length > 1e5) req.destroy(); });
  req.on('end', async () => {
    try { await route(req, res, p, req.method, b ? JSON.parse(b) : {}); }
    catch (e) { if (e.bad) return fail(res, 400, e.message); if (e instanceof SyntaxError) return fail(res, 400, 'Bad request'); console.error(e); if (!res.headersSent) fail(res, 500, 'Something went wrong on our side'); }
  });
});

// ---------- Start ----------
(async () => {
  await AUTH.ready;
  const fresh = await loadData(); migrate(fresh);
  if (APPDB && fresh) await APPDB.adopt(db); else if (APPDB) APPDB.queueRest();
  db.orders.forEach(indexOrder);
  server.listen(PORT, () => console.log('Instadrop running at http://localhost:' + PORT + ' (storage: ' + (APPDB ? 'PostgreSQL' : 'files') + ', payments: ' + MOMO.mode + ', sign-in required to order: ' + (REQUIRE_LOGIN ? 'yes' : 'no') + ')'));
})().catch(e => { console.error('Could not start:', e.message); process.exit(1); });
