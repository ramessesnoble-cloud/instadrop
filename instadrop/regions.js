// Regions: country -> state / province / region -> cities (with coordinates).
// Used to (1) show only the places that serve the region the customer picks, (2) detect the
// region from a live GPS position, and (3) choose the national language for that region.
// To add a region: add one P(...) line. Cities are "Name:lat:lng" separated by ";".
// The FIRST city is the main one (map centre / default browsing point).

const P = (id, n, cities, lang) => ({
  id, n, lang: lang || null,
  cities: cities.split(';').map(s => { const [cn, la, lo] = s.split(':'); return { n: cn.trim(), lat: +la, lng: +lo }; })
});

// Languages offered per country. The first one is the national / default language of that country.
// A region can override it (for example Quebec is French-speaking).
const LANGS = {
  UG: ['en', 'sw'], KE: ['sw', 'en'], TZ: ['sw', 'en'], RW: ['en', 'fr', 'sw'], GH: ['en'], NG: ['en'], ZA: ['en'], GB: ['en'],
  US: ['en', 'es'], CA: ['en', 'fr'], AU: ['en'], DE: ['de', 'en'], FR: ['fr', 'en'], IN: ['hi', 'en'], AE: ['ar', 'en'],
  BR: ['pt', 'en'], MX: ['es', 'en'], JP: ['ja', 'en']
};

const REGIONS = {
  US: [
    P('TX', 'Texas', 'Houston:29.76:-95.37;Dallas:32.78:-96.80;Austin:30.27:-97.74;San Antonio:29.42:-98.49'),
    P('CA', 'California', 'Los Angeles:34.05:-118.24;San Francisco:37.77:-122.42;San Diego:32.72:-117.16;Sacramento:38.58:-121.49'),
    P('NY', 'New York', 'New York City:40.71:-74.01;Buffalo:42.89:-78.88;Albany:42.65:-73.76'),
    P('FL', 'Florida', 'Miami:25.76:-80.19;Orlando:28.54:-81.38;Tampa:27.95:-82.46;Jacksonville:30.33:-81.66'),
    P('AL', 'Alabama', 'Birmingham:33.52:-86.80;Montgomery:32.37:-86.30;Huntsville:34.73:-86.59'),
    P('AK', 'Alaska', 'Anchorage:61.22:-149.90;Fairbanks:64.84:-147.72'),
    P('AZ', 'Arizona', 'Phoenix:33.45:-112.07;Tucson:32.22:-110.97'),
    P('AR', 'Arkansas', 'Little Rock:34.75:-92.29;Fayetteville:36.06:-94.16'),
    P('CO', 'Colorado', 'Denver:39.74:-104.99;Colorado Springs:38.83:-104.82'),
    P('CT', 'Connecticut', 'Hartford:41.76:-72.67;New Haven:41.31:-72.92'),
    P('DE', 'Delaware', 'Wilmington:39.74:-75.55;Dover:39.16:-75.52'),
    P('DC', 'Washington, D.C.', 'Washington:38.91:-77.04'),
    P('GA', 'Georgia', 'Atlanta:33.75:-84.39;Savannah:32.08:-81.09'),
    P('HI', 'Hawaii', 'Honolulu:21.31:-157.86'),
    P('ID', 'Idaho', 'Boise:43.62:-116.20'),
    P('IL', 'Illinois', 'Chicago:41.88:-87.63;Springfield:39.78:-89.65'),
    P('IN', 'Indiana', 'Indianapolis:39.77:-86.16'),
    P('IA', 'Iowa', 'Des Moines:41.59:-93.62'),
    P('KS', 'Kansas', 'Wichita:37.69:-97.34;Overland Park:38.98:-94.67'),
    P('KY', 'Kentucky', 'Louisville:38.25:-85.76;Lexington:38.04:-84.50'),
    P('LA', 'Louisiana', 'New Orleans:29.95:-90.07;Baton Rouge:30.45:-91.19'),
    P('ME', 'Maine', 'Portland:43.66:-70.26'),
    P('MD', 'Maryland', 'Baltimore:39.29:-76.61'),
    P('MA', 'Massachusetts', 'Boston:42.36:-71.06;Worcester:42.26:-71.80'),
    P('MI', 'Michigan', 'Detroit:42.33:-83.05;Grand Rapids:42.96:-85.67'),
    P('MN', 'Minnesota', 'Minneapolis:44.98:-93.27'),
    P('MS', 'Mississippi', 'Jackson:32.30:-90.18'),
    P('MO', 'Missouri', 'Kansas City:39.10:-94.58;St. Louis:38.63:-90.20'),
    P('MT', 'Montana', 'Billings:45.78:-108.50'),
    P('NE', 'Nebraska', 'Omaha:41.26:-95.93'),
    P('NV', 'Nevada', 'Las Vegas:36.17:-115.14;Reno:39.53:-119.81'),
    P('NH', 'New Hampshire', 'Manchester:42.99:-71.46'),
    P('NJ', 'New Jersey', 'Newark:40.74:-74.17;Jersey City:40.73:-74.08'),
    P('NM', 'New Mexico', 'Albuquerque:35.08:-106.65'),
    P('NC', 'North Carolina', 'Charlotte:35.23:-80.84;Raleigh:35.78:-78.64'),
    P('ND', 'North Dakota', 'Fargo:46.88:-96.79'),
    P('OH', 'Ohio', 'Columbus:39.96:-83.00;Cleveland:41.50:-81.69'),
    P('OK', 'Oklahoma', 'Oklahoma City:35.47:-97.52;Tulsa:36.15:-95.99'),
    P('OR', 'Oregon', 'Portland:45.52:-122.68'),
    P('PA', 'Pennsylvania', 'Philadelphia:39.95:-75.17;Pittsburgh:40.44:-79.99'),
    P('RI', 'Rhode Island', 'Providence:41.82:-71.41'),
    P('SC', 'South Carolina', 'Charleston:32.78:-79.93;Columbia:34.00:-81.03'),
    P('SD', 'South Dakota', 'Sioux Falls:43.54:-96.73'),
    P('TN', 'Tennessee', 'Nashville:36.16:-86.78;Memphis:35.15:-90.05'),
    P('UT', 'Utah', 'Salt Lake City:40.76:-111.89'),
    P('VT', 'Vermont', 'Burlington:44.48:-73.21'),
    P('VA', 'Virginia', 'Virginia Beach:36.85:-75.98;Richmond:37.54:-77.44'),
    P('WA', 'Washington', 'Seattle:47.61:-122.33;Spokane:47.66:-117.43'),
    P('WV', 'West Virginia', 'Charleston:38.35:-81.63'),
    P('WI', 'Wisconsin', 'Milwaukee:43.04:-87.91;Madison:43.07:-89.40'),
    P('WY', 'Wyoming', 'Cheyenne:41.14:-104.82')
  ],
  UG: [
    P('C', 'Central', 'Kampala:0.3476:32.5825;Entebbe:0.0512:32.4637'),
    P('E', 'Eastern', 'Jinja:0.4244:33.2042;Mbale:1.0775:34.1751'),
    P('N', 'Northern', 'Gulu:2.7746:32.2990'),
    P('W', 'Western', 'Mbarara:-0.6072:30.6545;Fort Portal:0.6710:30.2750')
  ],
  KE: [
    P('NB', 'Nairobi', 'Nairobi:-1.2864:36.8172'),
    P('CO', 'Coast', 'Mombasa:-4.0435:39.6682'),
    P('RV', 'Rift Valley', 'Nakuru:-0.3031:36.0800;Eldoret:0.5143:35.2698'),
    P('WE', 'Western', 'Kisumu:-0.0917:34.7680'),
    P('CE', 'Central', 'Nyeri:-0.4201:36.9476')
  ],
  TZ: [
    P('DS', 'Dar es Salaam', 'Dar es Salaam:-6.7924:39.2083'),
    P('AR', 'Arusha', 'Arusha:-3.3869:36.6830'),
    P('MW', 'Mwanza', 'Mwanza:-2.5164:32.9175'),
    P('DO', 'Dodoma', 'Dodoma:-6.1630:35.7516'),
    P('ZN', 'Zanzibar', 'Zanzibar City:-6.1659:39.2026')
  ],
  RW: [
    P('KG', 'Kigali', 'Kigali:-1.9441:30.0619'),
    P('NO', 'Northern', 'Musanze:-1.4998:29.6344'),
    P('SO', 'Southern', 'Huye:-2.5967:29.7394'),
    P('EA', 'Eastern', 'Rwamagana:-1.9487:30.4347'),
    P('WE', 'Western', 'Rubavu:-1.6786:29.2603')
  ],
  GH: [
    P('GA', 'Greater Accra', 'Accra:5.6037:-0.1870;Tema:5.6698:-0.0166'),
    P('AS', 'Ashanti', 'Kumasi:6.6885:-1.6244'),
    P('NO', 'Northern', 'Tamale:9.4034:-0.8424'),
    P('WE', 'Western', 'Takoradi:4.8962:-1.7554'),
    P('CE', 'Central', 'Cape Coast:5.1053:-1.2466')
  ],
  NG: [
    P('LA', 'Lagos', 'Lagos:6.5244:3.3792'),
    P('FC', 'Abuja (FCT)', 'Abuja:9.0765:7.3986'),
    P('RI', 'Rivers', 'Port Harcourt:4.8156:7.0498'),
    P('KN', 'Kano', 'Kano:12.0022:8.5920'),
    P('OY', 'Oyo', 'Ibadan:7.3775:3.9470'),
    P('EN', 'Enugu', 'Enugu:6.4584:7.5464')
  ],
  ZA: [
    P('GP', 'Gauteng', 'Johannesburg:-26.2041:28.0473;Pretoria:-25.7479:28.2293'),
    P('WC', 'Western Cape', 'Cape Town:-33.9249:18.4241'),
    P('KZ', 'KwaZulu-Natal', 'Durban:-29.8587:31.0218'),
    P('EC', 'Eastern Cape', 'Gqeberha:-33.9608:25.6022'),
    P('FS', 'Free State', 'Bloemfontein:-29.0852:26.1596')
  ],
  GB: [
    P('LN', 'London', 'London:51.5074:-0.1278'),
    P('NW', 'North West England', 'Manchester:53.4808:-2.2426;Liverpool:53.4084:-2.9916'),
    P('WM', 'West Midlands', 'Birmingham:52.4862:-1.8904'),
    P('YH', 'Yorkshire', 'Leeds:53.8008:-1.5491'),
    P('SW', 'South West England', 'Bristol:51.4545:-2.5879'),
    P('SC', 'Scotland', 'Edinburgh:55.9533:-3.1883;Glasgow:55.8642:-4.2518'),
    P('WA', 'Wales', 'Cardiff:51.4816:-3.1791'),
    P('NI', 'Northern Ireland', 'Belfast:54.5973:-5.9301')
  ],
  CA: [
    P('ON', 'Ontario', 'Toronto:43.6532:-79.3832;Ottawa:45.4215:-75.6972'),
    P('QC', 'Quebec', 'Montreal:45.5017:-73.5673;Quebec City:46.8139:-71.2080', 'fr'),
    P('BC', 'British Columbia', 'Vancouver:49.2827:-123.1207'),
    P('AB', 'Alberta', 'Calgary:51.0447:-114.0719;Edmonton:53.5461:-113.4938'),
    P('MB', 'Manitoba', 'Winnipeg:49.8951:-97.1384'),
    P('NS', 'Nova Scotia', 'Halifax:44.6488:-63.5752')
  ],
  AU: [
    P('NSW', 'New South Wales', 'Sydney:-33.8688:151.2093'),
    P('VIC', 'Victoria', 'Melbourne:-37.8136:144.9631'),
    P('QLD', 'Queensland', 'Brisbane:-27.4698:153.0251'),
    P('WA', 'Western Australia', 'Perth:-31.9505:115.8605'),
    P('SA', 'South Australia', 'Adelaide:-34.9285:138.6007'),
    P('TAS', 'Tasmania', 'Hobart:-42.8821:147.3272'),
    P('ACT', 'Australian Capital Territory', 'Canberra:-35.2809:149.1300')
  ],
  DE: [
    P('BE', 'Berlin', 'Berlin:52.5200:13.4050'),
    P('BY', 'Bavaria', 'Munich:48.1351:11.5820'),
    P('HH', 'Hamburg', 'Hamburg:53.5511:9.9937'),
    P('NW', 'North Rhine-Westphalia', 'Cologne:50.9375:6.9603;Düsseldorf:51.2277:6.7735'),
    P('HE', 'Hesse', 'Frankfurt:50.1109:8.6821'),
    P('BW', 'Baden-Württemberg', 'Stuttgart:48.7758:9.1829'),
    P('SN', 'Saxony', 'Leipzig:51.3397:12.3731')
  ],
  FR: [
    P('IDF', 'Île-de-France', 'Paris:48.8566:2.3522'),
    P('PAC', 'Provence-Alpes-Côte d’Azur', 'Marseille:43.2965:5.3698;Nice:43.7102:7.2620'),
    P('ARA', 'Auvergne-Rhône-Alpes', 'Lyon:45.7640:4.8357'),
    P('OCC', 'Occitanie', 'Toulouse:43.6047:1.4442'),
    P('NAQ', 'Nouvelle-Aquitaine', 'Bordeaux:44.8378:-0.5792'),
    P('HDF', 'Hauts-de-France', 'Lille:50.6292:3.0573'),
    P('BRE', 'Brittany', 'Rennes:48.1173:-1.6778')
  ],
  IN: [
    P('MH', 'Maharashtra', 'Mumbai:19.0760:72.8777;Pune:18.5204:73.8567'),
    P('DL', 'Delhi NCR', 'New Delhi:28.6139:77.2090'),
    P('KA', 'Karnataka', 'Bengaluru:12.9716:77.5946'),
    P('TN', 'Tamil Nadu', 'Chennai:13.0827:80.2707'),
    P('TG', 'Telangana', 'Hyderabad:17.3850:78.4867'),
    P('WB', 'West Bengal', 'Kolkata:22.5726:88.3639'),
    P('GJ', 'Gujarat', 'Ahmedabad:23.0225:72.5714'),
    P('RJ', 'Rajasthan', 'Jaipur:26.9124:75.7873')
  ],
  AE: [
    P('DU', 'Dubai', 'Dubai:25.2048:55.2708'),
    P('AZ', 'Abu Dhabi', 'Abu Dhabi:24.4539:54.3773'),
    P('SH', 'Sharjah', 'Sharjah:25.3463:55.4209')
  ],
  BR: [
    P('SP', 'São Paulo', 'São Paulo:-23.5505:-46.6333'),
    P('RJ', 'Rio de Janeiro', 'Rio de Janeiro:-22.9068:-43.1729'),
    P('MG', 'Minas Gerais', 'Belo Horizonte:-19.9167:-43.9345'),
    P('BA', 'Bahia', 'Salvador:-12.9777:-38.5016'),
    P('PR', 'Paraná', 'Curitiba:-25.4284:-49.2733'),
    P('RS', 'Rio Grande do Sul', 'Porto Alegre:-30.0346:-51.2177'),
    P('DF', 'Distrito Federal', 'Brasília:-15.7939:-47.8828')
  ],
  MX: [
    P('CMX', 'Ciudad de México', 'Mexico City:19.4326:-99.1332'),
    P('JAL', 'Jalisco', 'Guadalajara:20.6597:-103.3496'),
    P('NLE', 'Nuevo León', 'Monterrey:25.6866:-100.3161'),
    P('YUC', 'Yucatán', 'Mérida:20.9674:-89.5926'),
    P('ROO', 'Quintana Roo', 'Cancún:21.1619:-86.8515'),
    P('PUE', 'Puebla', 'Puebla:19.0414:-98.2063'),
    P('BCN', 'Baja California', 'Tijuana:32.5149:-117.0382')
  ],
  JP: [
    P('TK', 'Tokyo', 'Tokyo:35.6762:139.6503'),
    P('KS', 'Kansai', 'Osaka:34.6937:135.5023;Kyoto:35.0116:135.7681'),
    P('AI', 'Aichi', 'Nagoya:35.1815:136.9066'),
    P('KN', 'Kanagawa', 'Yokohama:35.4437:139.6380'),
    P('HK', 'Hokkaido', 'Sapporo:43.0618:141.3545'),
    P('FK', 'Fukuoka', 'Fukuoka:33.5904:130.4017'),
    P('OK', 'Okinawa', 'Naha:26.2124:127.6809')
  ]
};

// Global ids look like "US-TX". Region ids are unique inside a country only, so we prefix the country.
const ALL = [];
for (const [cc, list] of Object.entries(REGIONS)) for (const r of list) { r.cc = cc; r.key = cc + '-' + r.id; r.lat = r.cities[0].lat; r.lng = r.cities[0].lng; ALL.push(r); }
const BY_KEY = Object.fromEntries(ALL.map(r => [r.key, r]));

const rad = d => d * Math.PI / 180;
function km(a, b, c, d) { // great-circle distance in km
  const x = rad(c - a), y = rad(d - b), h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// The region and city nearest to a coordinate (within maxKm), or null when we do not serve that area.
function nearest(lat, lng, maxKm = 400) {
  let best = null;
  for (const r of ALL) for (const c of r.cities) { const d = km(lat, lng, c.lat, c.lng); if (!best || d < best.km) best = { region: r.key, cc: r.cc, city: c.n, km: d }; }
  return best && best.km <= maxKm ? best : null;
}

module.exports = { LANGS, REGIONS, ALL, BY_KEY, km, nearest };
