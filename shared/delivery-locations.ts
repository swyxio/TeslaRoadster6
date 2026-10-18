/** Original game-space handoffs and sourced restaurant identities.
 * Append after the historical delivery arrays; never reorder saved indices.
 * See docs/DELIVERY_LOCATIONS.md for coverage and activation requirements.
 */
export type DeliveryCityId =
  | 'san-francisco' | 'oakland' | 'berkeley' | 'emeryville' | 'mill-valley' | 'corte-madera'
  | 'south-san-francisco' | 'san-mateo' | 'redwood-city' | 'menlo-park' | 'palo-alto'
  | 'mountain-view' | 'santa-clara' | 'cupertino' | 'san-jose' | 'hayward' | 'fremont';
export type DeliveryAreaId = DeliveryCityId | 'sfo';
export type CuisineIcon = 'pizza'|'burger'|'sandwich'|'noodles'|'taco'|'bakery'|'bowl'|'plate';
export type RestaurantDetails = {cityId:DeliveryCityId;areaId:DeliveryAreaId;cuisine:string;cuisineIcon:CuisineIcon;signatureDish:string;sourceUrl:string;menuUrl?:string};
export type AddedRestaurant = RestaurantDetails & {id:string;name:string;address:string;x:number;z:number};
export type AddedCustomer = {id:string;name:string;cityId:DeliveryCityId;areaId:DeliveryAreaId;x:number;y:number;z:number;rooftop:false};

// Add metadata to, but do not replace or reorder, the existing pickup prefix.
export const HISTORIC_RESTAURANT_DETAILS = {
  "tartine": {
    "cityId": "san-francisco",
    "areaId": "san-francisco",
    "cuisine": "San Francisco bakery",
    "cuisineIcon": "bakery",
    "signatureDish": "Country bread",
    "sourceUrl": "https://tartinebakery.com/san-francisco/bakery"
  },
  "tonys": {
    "cityId": "san-francisco",
    "areaId": "san-francisco",
    "cuisine": "Pizza",
    "cuisineIcon": "pizza",
    "signatureDish": "Margherita pizza",
    "sourceUrl": "https://tonyspizzanapoletana.com/location/"
  },
  "burma": {
    "cityId": "san-francisco",
    "areaId": "san-francisco",
    "cuisine": "Burmese",
    "cuisineIcon": "plate",
    "signatureDish": "Tea leaf salad",
    "sourceUrl": "https://www.burmasuperstar.com/",
    "menuUrl": "https://www.burmasuperstar.com/s/BurmaTakeoutMenu_2022_01_10_Optimized-3xxj.pdf"
  },
  "nanking": {
    "cityId": "san-francisco",
    "areaId": "san-francisco",
    "cuisine": "Chinese",
    "cuisineIcon": "plate",
    "signatureDish": "Nanking sesame chicken",
    "sourceUrl": "https://houseofnanking.net/",
    "menuUrl": "https://www.houseofnankingsf.com/menu/"
  },
  "homeroom": {
    "cityId": "oakland",
    "areaId": "oakland",
    "cuisine": "American",
    "cuisineIcon": "plate",
    "signatureDish": "Mac and cheese",
    "sourceUrl": "https://www.homeroom510.com/locations"
  },
  "comal": {
    "cityId": "oakland",
    "areaId": "oakland",
    "cuisine": "Mexican",
    "cuisineIcon": "taco",
    "signatureDish": "Carnitas burrito",
    "sourceUrl": "https://www.comalnextdoor.com/location/comal-next-door-oakland/"
  }
} as const satisfies Record<string,RestaurantDetails>;

// Existing customers include six map landmarks and three supported roofs.
export const HISTORIC_CUSTOMER_AREAS = {
  "poly": {
    "cityId": "san-francisco",
    "areaId": "san-francisco"
  },
  "fog": {
    "cityId": "san-francisco",
    "areaId": "san-francisco"
  },
  "cable": {
    "cityId": "san-francisco",
    "areaId": "san-francisco"
  },
  "coast": {
    "cityId": "san-francisco",
    "areaId": "san-francisco"
  },
  "oak": {
    "cityId": "oakland",
    "areaId": "oakland"
  },
  "lake": {
    "cityId": "oakland",
    "areaId": "oakland"
  },
  "port": {
    "cityId": "oakland",
    "areaId": "oakland"
  },
  "landmark-berkeley": {
    "cityId": "berkeley",
    "areaId": "berkeley"
  },
  "landmark-sfo": {
    "cityId": "south-san-francisco",
    "areaId": "sfo"
  },
  "landmark-stanford": {
    "cityId": "palo-alto",
    "areaId": "palo-alto"
  },
  "landmark-mission-san-jose": {
    "cityId": "fremont",
    "areaId": "fremont"
  },
  "landmark-san-jose-city-hall": {
    "cityId": "san-jose",
    "areaId": "san-jose"
  },
  "landmark-ucsf": {
    "cityId": "san-francisco",
    "areaId": "san-francisco"
  },
  "roof-sf--78--90": {
    "cityId": "san-francisco",
    "areaId": "san-francisco"
  },
  "roof-sf-42-150": {
    "cityId": "san-francisco",
    "areaId": "san-francisco"
  },
  "roof-oakland-350--30": {
    "cityId": "oakland",
    "areaId": "oakland"
  }
} as const satisfies Record<string,{cityId:DeliveryCityId;areaId:DeliveryAreaId}>;

export const ADDED_RESTAURANTS:readonly AddedRestaurant[] = [
  {"id":"san-francisco-montesacro","name":"Montesacro Soma","cityId":"san-francisco","areaId":"san-francisco","cuisine":"Roman Italian","cuisineIcon":"pizza","signatureDish":"San Lorenzo pinsa","address":"510 Stevenson St, San Francisco, CA 94103","sourceUrl":"https://www.toasttab.com/local/order/montesacro-soma-510-stevenson-street/item-marinated-vegetables_189a7272-e9d1-4297-95fc-1d94ad3daf90","x":-227,"z":-177},
  {"id":"san-francisco-dabao","name":"Dabao Singapore","cityId":"san-francisco","areaId":"san-francisco","cuisine":"Singaporean","cuisineIcon":"bowl","signatureDish":"Hainanese chicken rice","address":"135 4th St, FC03, San Francisco, CA 94103","sourceUrl":"https://www.toasttab.com/local/order/dabao-singapore-135-4th-st-fc03/item-chili-crab_a6b00e66-0998-4025-85b7-df3be5970343","x":-177,"z":-64},
  {"id":"san-francisco-basil-thai","name":"Basil Thai Restaurant & Bar","cityId":"san-francisco","areaId":"san-francisco","cuisine":"Thai","cuisineIcon":"plate","signatureDish":"Pad see ew","address":"1175 Folsom St, San Francisco, CA 94103","sourceUrl":"https://www.toasttab.com/local/order/basil-thai-restaurant-1175-folsom-street/item-utensil_82f3e24a-eb1e-4bbd-baab-1914f029e7e1","x":-3,"z":4},
  {"id":"san-francisco-el-rey","name":"El Rey Taquiza Artesanal","cityId":"san-francisco","areaId":"san-francisco","cuisine":"Mexican","cuisineIcon":"taco","signatureDish":"Burrito super","address":"2491 Mission St, San Francisco, CA 94110","sourceUrl":"https://www.toasttab.com/local/order/el-rey-taquiza-artesanal-2491-mission-street/item-lagunitas-hazy_d7663256-8ad6-45f8-948b-bb69dabcf17b","x":-200,"z":-177},
  {"id":"san-francisco-el-buen-comer","name":"El Buen Comer","cityId":"san-francisco","areaId":"san-francisco","cuisine":"Mexican","cuisineIcon":"taco","signatureDish":"Cheese enchiladas","address":"3435 Mission St, San Francisco, CA 94110","sourceUrl":"https://www.toasttab.com/local/order/el-buen-comer-3435-mission-st/item-tortas_6b40c981-616f-4fd5-914a-4eed29565c14","x":-40,"z":117},
  {"id":"san-francisco-yuja","name":"Yuja","cityId":"san-francisco","areaId":"san-francisco","cuisine":"Asian fusion","cuisineIcon":"plate","signatureDish":"Yuja teriyaki","address":"396 Harrison St, San Francisco, CA 94105","sourceUrl":"https://www.toasttab.com/local/order/yuja-396-harrison-street/item-tofu-tonkatsu_9ecf00ac-bc92-4c7a-a51d-1fcb2b741ac1","x":-80,"z":-57},
  {"id":"oakland-saints","name":"Saints Smokehouse","cityId":"oakland","areaId":"oakland","cuisine":"Barbecue","cuisineIcon":"plate","signatureDish":"Smoked pork rib plate","address":"218 13th St, Oakland, CA 94612","sourceUrl":"https://www.saintssmokehouse.com/","x":507,"z":139},
  {"id":"oakland-stay-gold","name":"Stay Gold Deli","cityId":"oakland","areaId":"oakland","cuisine":"Barbecue","cuisineIcon":"sandwich","signatureDish":"Brisket sandwich","address":"2635 San Pablo Ave, Oakland, CA 94612","sourceUrl":"https://mymurph8.wixsite.com/stay-gold-deli-5/online-ordering","x":461,"z":177},
  {"id":"oakland-cafe-dareye","name":"Cafe Dareye","cityId":"oakland","areaId":"oakland","cuisine":"Ethiopian","cuisineIcon":"plate","signatureDish":"Ethiopian vegan platter","address":"2504 Telegraph Ave, Oakland, CA 94612","sourceUrl":"https://www.toasttab.com/local/order/cafe-dareye/item-injera_74d863b3-e2c2-4f98-8867-201f25ad712e","x":434,"z":177},
  {"id":"oakland-todos","name":"Todos","cityId":"oakland","areaId":"oakland","cuisine":"Mexican","cuisineIcon":"taco","signatureDish":"Baja fish taco","address":"2315 Valdez St, Oakland, CA 94612","sourceUrl":"https://www.toasttab.com/local/order/todos/item-orange-juice_eacbe13c-202d-4da3-8ace-c0fe24312c79","x":407,"z":177},
  {"id":"oakland-que-rico","name":"Que Rico","cityId":"oakland","areaId":"oakland","cuisine":"Mexican","cuisineIcon":"taco","signatureDish":"Al pastor street tacos","address":"381 15th St, Oakland, CA 94612","sourceUrl":"https://order.toasttab.com/online/que-rico-oakland-381-15th-street/item-1-street-tacos_98dc548b-6f27-42d4-8841-a768ca1a9b25","x":333,"z":167},
  {"id":"oakland-shooting-star","name":"Shooting Star Cafe","cityId":"oakland","areaId":"oakland","cuisine":"Cantonese","cuisineIcon":"plate","signatureDish":"Baked cream pork chop","address":"1022 Webster St, Oakland, CA 94607","sourceUrl":"https://www.shootingstarhkcafe.com/","x":507,"z":166},
  {"id":"oakland-spices-3","name":"Spices 3","cityId":"oakland","areaId":"oakland","cuisine":"Sichuan","cuisineIcon":"plate","signatureDish":"Ma-Po tofu","address":"372 12th St, Oakland, CA 94607","sourceUrl":"https://spices3-oakland.com/","x":567,"z":64},
  {"id":"oakland-tay-ho","name":"Tay Ho","cityId":"oakland","areaId":"oakland","cuisine":"Vietnamese","cuisineIcon":"noodles","signatureDish":"Classic chicken pho","address":"344 12th St, Oakland, CA 94607","sourceUrl":"https://tayhooakland.com/en-US","x":557,"z":117},
  {"id":"berkeley-cheese-board","name":"Cheese Board Pizza","cityId":"berkeley","areaId":"berkeley","cuisine":"Vegetarian pizza","cuisineIcon":"pizza","signatureDish":"Pizza of the day","address":"1512 Shattuck Ave, Berkeley, CA 94709","sourceUrl":"https://cheeseboardcollective.coop/directions-hours/contact-us/","x":343,"z":-177},
  {"id":"berkeley-angelines","name":"Angeline's Louisiana Kitchen","cityId":"berkeley","areaId":"berkeley","cuisine":"Louisiana","cuisineIcon":"plate","signatureDish":"Voo Doo shrimp","address":"2261 Shattuck Ave, Berkeley, CA 94704","sourceUrl":"https://order.toasttab.com/online/angelines-louisiana-kitchen-2261-shattuck-ave","x":388,"z":-177},
  {"id":"berkeley-jupiter","name":"Jupiter","cityId":"berkeley","areaId":"berkeley","cuisine":"Wood-fired pizza","cuisineIcon":"pizza","signatureDish":"Wood-fired pizza","address":"2181 Shattuck Ave, Berkeley, CA 94704","sourceUrl":"https://www.jupiterbeer.com/","x":424,"z":-177},
  {"id":"berkeley-sliver","name":"Sliver Pizzeria","cityId":"berkeley","areaId":"berkeley","cuisine":"Vegetarian pizza","cuisineIcon":"pizza","signatureDish":"Pizza of the day","address":"2174 Shattuck Ave, Berkeley, CA 94704","sourceUrl":"https://www.toasttab.com/local/order/sliver-pizzeria-shattuck-2174-shattuck-ave/item-coke-zero_120e3668-2df3-4edc-a314-89968dd81677","x":460,"z":-177},
  {"id":"berkeley-original-pollo","name":"Original Pollo","cityId":"berkeley","areaId":"berkeley","cuisine":"Chicken","cuisineIcon":"plate","signatureDish":"BBQ chicken","address":"2101 Shattuck Ave, Berkeley, CA 94704","sourceUrl":"https://www.originalpollo.com/","x":487,"z":-177},
  {"id":"berkeley-espresso","name":"Berkeley Espresso","cityId":"berkeley","areaId":"berkeley","cuisine":"Cafe","cuisineIcon":"sandwich","signatureDish":"Lox bagel","address":"1900 Shattuck Ave, Berkeley, CA 94704","sourceUrl":"https://www.berkeleyespresso.com/","x":507,"z":-158},
  {"id":"berkeley-fish-and-bird","name":"Fish & Bird Sousaku Izakaya","cityId":"berkeley","areaId":"berkeley","cuisine":"Japanese","cuisineIcon":"bowl","signatureDish":"Chicken karaage with rice","address":"2451 Shattuck Ave, Berkeley, CA 94704","sourceUrl":"https://www.toasttab.com/local/order/fish-bird-sousaku-izakaya/item-steelhead-nabe-large_c5837c42-0b92-4964-bf42-68d3d195c77d","x":507,"z":-86},
  {"id":"berkeley-raleighs-mezzo","name":"Raleigh's Pub / Mezzo","cityId":"berkeley","areaId":"berkeley","cuisine":"Cafe","cuisineIcon":"taco","signatureDish":"Breakfast burrito","address":"2442 Telegraph Ave, Berkeley, CA 94704","sourceUrl":"https://www.toasttab.com/local/order/mezzo/item-12-pbhb-sandwich-cup-of-soup-online-to-go_9f3492b2-dd41-4357-a6aa-858cb82d14f4","x":507,"z":-59},
  {"id":"berkeley-bigotes","name":"Bigotes Pizza","cityId":"berkeley","areaId":"berkeley","cuisine":"Pizza","cuisineIcon":"pizza","signatureDish":"Bigotes special sandwich","address":"1706 University Ave, Berkeley, CA 94703","sourceUrl":"https://www.toasttab.com/local/order/bigotespizza/item-you-make-it-we-bake-it-small_7c950166-e556-444f-8a14-08a789b62776","x":333,"z":-22},
  {"id":"berkeley-la-note","name":"La Note","cityId":"berkeley","areaId":"berkeley","cuisine":"French Provençal","cuisineIcon":"plate","signatureDish":"Potato and caramelized onion omelette","address":"2377 Shattuck Ave, Berkeley, CA 94704","sourceUrl":"https://www.lanoterestaurant.com/menu","menuUrl":"https://order.online/store/la-note-1375843","x":333,"z":-139},
  {"id":"emeryville-townhouse","name":"Townhouse","cityId":"emeryville","areaId":"emeryville","cuisine":"California","cuisineIcon":"plate","signatureDish":"Baby back ribs","address":"5862 Doyle St, Emeryville, CA 94608","sourceUrl":"https://townhouseemeryville.com/","x":507,"z":-113},
  {"id":"emeryville-honor","name":"Honor Kitchen & Cocktails","cityId":"emeryville","areaId":"emeryville","cuisine":"California","cuisineIcon":"bowl","signatureDish":"Seared ahi tuna bowl","address":"1411 Powell St, Emeryville, CA 94608","sourceUrl":"https://www.toasttab.com/local/order/honor-kitchen-cocktails/item-seared-ahi-tuna-bowl_d73fc85a-ee30-4e42-b493-ffc3e4f7d383","x":507,"z":-32},
  {"id":"emeryville-rudys","name":"Rudy's Can't Fail Cafe","cityId":"emeryville","areaId":"emeryville","cuisine":"Diner","cuisineIcon":"plate","signatureDish":"Green Eggs and Ham","address":"4081 Hollis St, Emeryville, CA 94608","sourceUrl":"https://www.toasttab.com/local/order/rudys-emeryville-4081-hollis-street/item-cheese-quesadilla_68f69d7e-f767-4db2-9ae7-e3dab8aa8860","x":507,"z":-5},
  {"id":"emeryville-demiya","name":"Demiya","cityId":"emeryville","areaId":"emeryville","cuisine":"Japanese curry","cuisineIcon":"bowl","signatureDish":"Ebi tempura curry rice","address":"5959 Shellmound St, Kiosk 2, Emeryville, CA 94608","sourceUrl":"https://www.toasttab.com/local/order/demiya-emeryville-5959-shellmound-street/item-5-ebi-tempura-curry-rice_f619aef2-224c-444b-af8c-1ff6a3c3f75a","x":507,"z":22},
  {"id":"emeryville-flores","name":"Flores Taqueria","cityId":"emeryville","areaId":"emeryville","cuisine":"Mexican","cuisineIcon":"taco","signatureDish":"Chili colorado taco","address":"5614 Bay St, Suite 244, Emeryville, CA 94608","sourceUrl":"https://www.toasttab.com/local/order/flores-taqueria-emeryville/item-agua-fresca_d0ccc568-0826-482a-ba23-4ac6766dc396","x":507,"z":49},
  {"id":"emeryville-doyle","name":"Doyle Street Cafe","cityId":"emeryville","areaId":"emeryville","cuisine":"Breakfast","cuisineIcon":"taco","signatureDish":"Breakfast burrito","address":"5515 Doyle St, Emeryville, CA 94608","sourceUrl":"https://www.toasttab.com/local/order/doyle-street-cafe-5515-doyle-street/item-chinese-chicken-salad_9e05a027-fb00-4c67-b9c0-d1b35d4d9c0c","x":507,"z":94},
  {"id":"emeryville-los-moles","name":"Los Moles","cityId":"emeryville","areaId":"emeryville","cuisine":"Mexican","cuisineIcon":"plate","signatureDish":"Mole poblano","address":"1320 65th St, Emeryville, CA 94608","sourceUrl":"https://www.toasttab.com/local/order/los-moles-emeryville-1320-65th-street/item-los-moles-buffet_c24154c7-875b-4b15-bc64-3a6f0c029d4c","x":333,"z":41},
  {"id":"emeryville-paradita","name":"Paradita","cityId":"emeryville","areaId":"emeryville","cuisine":"Peruvian","cuisineIcon":"bowl","signatureDish":"Lomito bowl","address":"5959 Shellmound St, Suite 1, Emeryville, CA 94608","sourceUrl":"https://www.toasttab.com/local/order/paradita/item-hh-bohemia_7fa35f81-ad2c-4270-b915-ae6c37b0a236","x":333,"z":-94},
  {"id":"emeryville-senor-pico","name":"Señor Pico","cityId":"emeryville","areaId":"emeryville","cuisine":"Mexican","cuisineIcon":"taco","signatureDish":"Beef barbacoa taco","address":"9 Anchor Dr, Emeryville, CA 94608","sourceUrl":"https://senorpico.com/bay-area/","menuUrl":"https://senorpico.com/bay-area/mexican-food-menu/","x":567,"z":-80},
  {"id":"emeryville-good-to-eat","name":"Good To Eat","cityId":"emeryville","areaId":"emeryville","cuisine":"Taiwanese","cuisineIcon":"plate","signatureDish":"Fu-Ru fried chicken","address":"1298 65th St, Emeryville, CA 94608","sourceUrl":"https://www.wearegoodtoeat.com/menu","x":567,"z":-44},
];

export const ADDED_CUSTOMERS:readonly AddedCustomer[] = [
  {"id":"customer-san-francisco-01","name":"Fogline Studio · San Francisco","cityId":"san-francisco","areaId":"san-francisco","x":-237,"y":0,"z":53,"rooftop":false},
  {"id":"customer-san-francisco-02","name":"Mission Mural Workshop · San Francisco","cityId":"san-francisco","areaId":"san-francisco","x":57,"y":0,"z":-62,"rooftop":false},
  {"id":"customer-san-francisco-03","name":"Cable Car Book Club · San Francisco","cityId":"san-francisco","areaId":"san-francisco","x":-123,"y":0,"z":-140,"rooftop":false},
  {"id":"customer-oakland-01","name":"Lakeview Sketch Club · Oakland","cityId":"oakland","areaId":"oakland","x":530,"y":0,"z":117,"rooftop":false},
  {"id":"customer-oakland-02","name":"Redwood Road Makers · Oakland","cityId":"oakland","areaId":"oakland","x":449,"y":0,"z":117,"rooftop":false},
  {"id":"customer-oakland-03","name":"Portside Print Shop · Oakland","cityId":"oakland","areaId":"oakland","x":413,"y":0,"z":117,"rooftop":false},
  {"id":"customer-oakland-04","name":"Fruitvale Music Room · Oakland","cityId":"oakland","areaId":"oakland","x":356,"y":0,"z":57,"rooftop":false},
  {"id":"customer-oakland-05","name":"Temescal Screen Studio · Oakland","cityId":"oakland","areaId":"oakland","x":488,"y":0,"z":177,"rooftop":false},
  {"id":"customer-oakland-06","name":"East Bay Gardeners · Oakland","cityId":"oakland","areaId":"oakland","x":333.3,"y":0,"z":139,"rooftop":false},
  {"id":"customer-berkeley-01","name":"Campanile Sketch Club · Berkeley","cityId":"berkeley","areaId":"berkeley","x":439,"y":0,"z":-117,"rooftop":false},
  {"id":"customer-berkeley-02","name":"Telegraph Print Shop · Berkeley","cityId":"berkeley","areaId":"berkeley","x":466,"y":0,"z":-117,"rooftop":false},
  {"id":"customer-berkeley-03","name":"Creekside Makers · Berkeley","cityId":"berkeley","areaId":"berkeley","x":547,"y":0,"z":-117,"rooftop":false},
  {"id":"customer-berkeley-04","name":"Sather Book Club · Berkeley","cityId":"berkeley","areaId":"berkeley","x":567,"y":0,"z":-107,"rooftop":false},
  {"id":"customer-berkeley-05","name":"Northside Potters · Berkeley","cityId":"berkeley","areaId":"berkeley","x":393,"y":0,"z":-28,"rooftop":false},
  {"id":"customer-berkeley-06","name":"Campus Radio Club · Berkeley","cityId":"berkeley","areaId":"berkeley","x":393,"y":0,"z":-100,"rooftop":false},
  {"id":"customer-berkeley-07","name":"Rose Garden Artists · Berkeley","cityId":"berkeley","areaId":"berkeley","x":343,"y":0,"z":-57,"rooftop":false},
  {"id":"customer-berkeley-08","name":"Shattuck Repair Shop · Berkeley","cityId":"berkeley","areaId":"berkeley","x":433,"y":0,"z":-57,"rooftop":false},
  {"id":"customer-berkeley-09","name":"Hillside Film Studio · Berkeley","cityId":"berkeley","areaId":"berkeley","x":447,"y":0,"z":-38,"rooftop":false},
  {"id":"customer-emeryville-01","name":"Shellmound Sketch Club · Emeryville","cityId":"emeryville","areaId":"emeryville","x":567,"y":0,"z":37,"rooftop":false},
  {"id":"customer-emeryville-02","name":"Bayfront Makers · Emeryville","cityId":"emeryville","areaId":"emeryville","x":567,"y":0,"z":91,"rooftop":false},
  {"id":"customer-emeryville-03","name":"Powell Print Studio · Emeryville","cityId":"emeryville","areaId":"emeryville","x":393,"y":0,"z":80,"rooftop":false},
  {"id":"customer-emeryville-04","name":"Marina Book Club · Emeryville","cityId":"emeryville","areaId":"emeryville","x":393,"y":0,"z":35,"rooftop":false},
  {"id":"customer-emeryville-05","name":"Eastshore Game Studio · Emeryville","cityId":"emeryville","areaId":"emeryville","x":393,"y":0,"z":-1,"rooftop":false},
  {"id":"customer-emeryville-06","name":"Hollis Film Lab · Emeryville","cityId":"emeryville","areaId":"emeryville","x":388,"y":0,"z":-57,"rooftop":false},
  {"id":"customer-emeryville-07","name":"Paintbox Workshop · Emeryville","cityId":"emeryville","areaId":"emeryville","x":447,"y":0,"z":25,"rooftop":false},
  {"id":"customer-emeryville-08","name":"Tidepool Music Room · Emeryville","cityId":"emeryville","areaId":"emeryville","x":437,"y":0,"z":57,"rooftop":false},
  {"id":"customer-emeryville-09","name":"Harbor Gardeners · Emeryville","cityId":"emeryville","areaId":"emeryville","x":392,"y":0,"z":57,"rooftop":false},
  {"id":"customer-emeryville-10","name":"North Bay Design Co-op · Emeryville","cityId":"emeryville","areaId":"emeryville","x":333,"y":0,"z":11,"rooftop":false},
];
