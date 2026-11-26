/* Noèsis — Globe du réseau personnel (3 nov. 2026) : villes du monde (latitude, longitude) et contours très simplifiés des continents.
 * Tout est local : aucune adresse n'est envoyée à un service externe. TMT.geo.find('Montréal') -> {lat, lon} ou null. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var norm = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  // nom|lat|lon (plusieurs graphies séparées par « / » pour un même lieu)
  var CITIES = ('montreal/montreal qc/mtl|45.50|-73.57;longueuil|45.53|-73.52;laval|45.61|-73.71;brossard|45.46|-73.47;quebec/quebec city|46.81|-71.21;levis|46.80|-71.18;' +
    'gatineau|45.48|-75.70;ottawa|45.42|-75.70;sherbrooke|45.40|-71.89;trois rivieres|46.34|-72.54;saguenay|48.43|-71.07;val d or|48.10|-77.78;rouyn noranda|48.24|-79.02;sudbury|46.49|-81.00;' +
    'toronto|43.65|-79.38;mississauga|43.59|-79.64;hamilton|43.26|-79.87;london|51.51|-0.13;londres|51.51|-0.13;winnipeg|49.90|-97.14;calgary|51.05|-114.07;edmonton|53.55|-113.49;' +
    'vancouver|49.28|-123.12;victoria|48.43|-123.37;halifax|44.65|-63.57;saint jean|47.56|-52.71;st john s|47.56|-52.71;regina|50.45|-104.61;saskatoon|52.13|-106.67;yellowknife|62.45|-114.37;whitehorse|60.72|-135.06;' +
    'new york/new york city/nyc|40.71|-74.01;boston|42.36|-71.06;washington|38.91|-77.04;philadelphie/philadelphia|39.95|-75.17;chicago|41.88|-87.63;detroit|42.33|-83.05;atlanta|33.75|-84.39;miami|25.76|-80.19;' +
    'houston|29.76|-95.37;dallas|32.78|-96.80;austin|30.27|-97.74;denver|39.74|-104.99;phoenix|33.45|-112.07;las vegas|36.17|-115.14;los angeles|34.05|-118.24;san diego|32.72|-117.16;' +
    'san francisco|37.77|-122.42;san jose|37.34|-121.89;seattle|47.61|-122.33;portland|45.52|-122.68;salt lake city|40.76|-111.89;minneapolis|44.98|-93.27;' +
    'mexico|19.43|-99.13;mexico city|19.43|-99.13;guadalajara|20.66|-103.35;monterrey|25.69|-100.32;panama|8.98|-79.52;bogota|4.71|-74.07;medellin|6.24|-75.58;lima|-12.05|-77.04;santiago|-33.45|-70.67;' +
    'buenos aires|-34.60|-58.38;sao paulo|-23.55|-46.63;rio de janeiro|-22.91|-43.17;brasilia|-15.78|-47.93;caracas|10.48|-66.90;quito|-0.18|-78.47;la havane/havana|23.11|-82.37;port au prince|18.54|-72.34;' +
    'paris|48.86|2.35;lyon|45.76|4.84;marseille|43.30|5.37;toulouse|43.60|1.44;bordeaux|44.84|-0.58;lille|50.63|3.06;nantes|47.22|-1.55;strasbourg|48.57|7.75;nice|43.70|7.27;' +
    'bruxelles/brussels|50.85|4.35;geneve/geneva|46.20|6.14;zurich|47.37|8.54;berne/bern|46.95|7.45;luxembourg|49.61|6.13;amsterdam|52.37|4.90;rotterdam|51.92|4.48;' +
    'berlin|52.52|13.40;munich|48.14|11.58;francfort/frankfurt|50.11|8.68;hambourg/hamburg|53.55|9.99;cologne|50.94|6.96;vienne/vienna|48.21|16.37;prague|50.08|14.44;varsovie/warsaw|52.23|21.01;budapest|47.50|19.04;' +
    'madrid|40.42|-3.70;barcelone/barcelona|41.39|2.17;lisbonne/lisbon|38.72|-9.14;porto|41.15|-8.61;rome|41.90|12.50;milan|45.46|9.19;naples|40.85|14.27;athenes/athens|37.98|23.73;istanbul|41.01|28.98;' +
    'dublin|53.35|-6.26;edimbourg/edinburgh|55.95|-3.19;manchester|53.48|-2.24;oslo|59.91|10.75;stockholm|59.33|18.07;copenhague/copenhagen|55.68|12.57;helsinki|60.17|24.94;reykjavik|64.15|-21.94;' +
    'moscou/moscow|55.76|37.62;saint petersbourg/saint petersburg|59.93|30.34;kiev/kyiv|50.45|30.52;bucarest/bucharest|44.43|26.10;sofia|42.70|23.32;belgrade|44.79|20.46;' +
    'casablanca|33.57|-7.59;rabat|34.02|-6.84;marrakech|31.63|-8.01;alger/algiers|36.75|3.06;tunis|36.81|10.18;le caire/cairo|30.04|31.24;dakar|14.72|-17.47;abidjan|5.36|-4.01;accra|5.60|-0.19;' +
    'lagos|6.52|3.38;kinshasa|-4.44|15.27;nairobi|-1.29|36.82;addis abeba/addis ababa|9.03|38.74;johannesburg|-26.20|28.05;le cap/cape town|-33.92|18.42;kigali|-1.95|30.06;yaounde|3.85|11.50;douala|4.05|9.77;' +
    'tel aviv|32.09|34.78;jerusalem|31.77|35.22;beyrouth/beirut|33.89|35.50;dubai|25.20|55.27;abu dhabi|24.45|54.38;doha|25.29|51.53;riyad/riyadh|24.71|46.68;teheran/tehran|35.69|51.39;' +
    'mumbai|19.08|72.88;delhi/new delhi|28.61|77.21;bangalore/bengaluru|12.97|77.59;chennai|13.08|80.27;kolkata|22.57|88.36;karachi|24.86|67.01;dhaka|23.81|90.41;colombo|6.93|79.86;' +
    'singapour/singapore|1.35|103.82;kuala lumpur|3.14|101.69;bangkok|13.76|100.50;hanoi|21.03|105.85;ho chi minh|10.82|106.63;jakarta|-6.21|106.85;manille/manila|14.60|120.98;' +
    'hong kong|22.32|114.17;shenzhen|22.54|114.06;guangzhou|23.13|113.26;shanghai|31.23|121.47;pekin/beijing|39.90|116.41;taipei|25.03|121.57;seoul|37.57|126.98;tokyo|35.68|139.69;osaka|34.69|135.50;' +
    'sydney|-33.87|151.21;melbourne|-37.81|144.96;brisbane|-27.47|153.03;perth|-31.95|115.86;auckland|-36.85|174.76;wellington|-41.29|174.78').split(';').map(function (e) {
    var p = e.split('|'); return { names: p[0].split('/'), lat: Number(p[1]), lon: Number(p[2]) };
  });
  var index = {};
  CITIES.forEach(function (c) { c.names.forEach(function (n) { index[norm(n)] = c; }); });
  function find(name) {
    var k = norm(String(name || '').split(',')[0]);
    var c = k ? index[k] : null;
    return c ? { lat: c.lat, lon: c.lon, key: norm(c.names[0]), label: c.names[0] } : null;
  }

  // Contours très simplifiés [longitude, latitude] ; dessinés seulement pour situer les villes.
  var LAND = [
    [[-168, 66], [-162, 70], [-141, 70], [-125, 70], [-95, 72], [-82, 68], [-65, 62], [-56, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-83, 29], [-90, 30], [-97, 26], [-97, 22], [-92, 18], [-87, 21], [-88, 16], [-83, 10], [-79, 9], [-83, 8], [-86, 12], [-92, 15], [-105, 20], [-110, 24], [-112, 29], [-115, 30], [-110, 23], [-117, 32], [-124, 40], [-124, 48], [-135, 58], [-148, 60], [-155, 58], [-165, 55], [-158, 59], [-166, 62]],
    [[-73, 78], [-60, 82], [-30, 83], [-20, 76], [-22, 70], [-40, 65], [-45, 60], [-52, 64], [-58, 75]],
    [[-79, 9], [-72, 12], [-62, 10], [-52, 5], [-50, 0], [-44, -2], [-35, -6], [-39, -14], [-41, -22], [-48, -26], [-54, -34], [-58, -38], [-65, -42], [-68, -52], [-70, -55], [-74, -50], [-73, -40], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 0], [-77, 4]],
    [[-10, 36], [-9, 43], [-2, 44], [-4, 48], [2, 51], [8, 54], [10, 57], [12, 55], [18, 55], [24, 58], [22, 60], [30, 60], [22, 65], [28, 71], [40, 67], [44, 68], [60, 69], [70, 73], [80, 73], [100, 77], [113, 74], [140, 72], [160, 70], [180, 68], [180, 65], [170, 60], [163, 58], [156, 51], [142, 53], [140, 48], [132, 43], [128, 40], [129, 35], [126, 35], [122, 40], [118, 38], [122, 31], [120, 24], [110, 20], [108, 16], [109, 12], [105, 9], [101, 13], [100, 8], [103, 1], [98, 8], [98, 16], [94, 17], [91, 22], [86, 20], [80, 15], [78, 8], [73, 17], [72, 22], [67, 25], [57, 25], [56, 27], [50, 30], [48, 29], [51, 25], [56, 24], [59, 22], [52, 16], [43, 13], [38, 21], [35, 28], [34, 31], [36, 36], [30, 36], [27, 37], [26, 40], [29, 41], [24, 40], [20, 40], [19, 42], [13, 45], [18, 40], [16, 38], [12, 42], [8, 44], [3, 43], [-1, 37]],
    [[-17, 21], [-13, 28], [-6, 36], [10, 37], [11, 33], [20, 31], [32, 31], [35, 28], [43, 12], [51, 12], [42, -1], [40, -10], [40, -16], [35, -24], [32, -29], [27, -34], [18, -34], [15, -27], [12, -17], [13, -8], [9, -1], [9, 4], [3, 6], [-8, 4], [-13, 8], [-17, 14]],
    [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [135, -34], [130, -32], [115, -34], [115, -26]],
    [[-5, 50], [1, 51], [2, 53], [-2, 57], [-5, 58], [-6, 55], [-3, 54], [-5, 52]],
    [[130, 31], [135, 34], [140, 36], [142, 40], [141, 45], [145, 44], [140, 41], [137, 37], [132, 34]],
    [[-24, 65], [-14, 66], [-14, 64], [-22, 63]],
  ];
  TMT.geo = { find: find, land: LAND, norm: norm };
})();
