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
  {"id":"mill-valley-stefanos","name":"Stefano's Pizza","cityId":"mill-valley","areaId":"mill-valley","cuisine":"Pizza","cuisineIcon":"pizza","signatureDish":"Portuguese pizza","address":"11 E Blithedale Ave, Mill Valley, CA 94941","sourceUrl":"https://www.stefanosmillvalley.com/","x":-195,"z":-535},
  {"id":"mill-valley-piazza-dangelo","name":"Piazza D'Angelo","cityId":"mill-valley","areaId":"mill-valley","cuisine":"Italian","cuisineIcon":"noodles","signatureDish":"Fettuccine alla Bolognese","address":"22 Miller Ave, Mill Valley, CA 94941","sourceUrl":"https://piazzadangelo.com/mill-valley-piazza-d-angelo-food-menu","x":-175,"z":-535},
  {"id":"mill-valley-tam-tavern","name":"Tam Tavern","cityId":"mill-valley","areaId":"mill-valley","cuisine":"American","cuisineIcon":"burger","signatureDish":"Tavern cheeseburger","address":"152 Shoreline Highway, Mill Valley, CA 94941","sourceUrl":"https://tamtavernmv.com/","menuUrl":"https://toast.app/r/floodwater-restaurant-mill-valley-152-shoreline-highway/order","x":-155,"z":-535},
  {"id":"mill-valley-playa","name":"Playa","cityId":"mill-valley","areaId":"mill-valley","cuisine":"Mexican","cuisineIcon":"plate","signatureDish":"Pollo al carbón","address":"41 Throckmorton Ave, Mill Valley, CA 94941","sourceUrl":"https://www.toasttab.com/local/order/playa-mill-valley-41-throckmorton-ave/item-pollo-al-carbon-to-go_e764ec6b-d4c6-4b2b-9305-0118b2546597","x":-130,"z":-535},
  {"id":"mill-valley-piatti","name":"Piatti","cityId":"mill-valley","areaId":"mill-valley","cuisine":"Italian","cuisineIcon":"plate","signatureDish":"Cioppino","address":"625 Redwood Highway, Mill Valley, CA 94941","sourceUrl":"https://www.toasttab.com/local/order/piatti-mill-valley/item-cioppino_d605bbb0-3002-4796-a8bb-219880c679a1","x":-210,"z":-520},
  {"id":"mill-valley-lighthouse","name":"Lighthouse Bar & Grill","cityId":"mill-valley","areaId":"mill-valley","cuisine":"American","cuisineIcon":"sandwich","signatureDish":"California club","address":"475 E Strawberry Dr, Mill Valley, CA 94941","sourceUrl":"https://order.toasttab.com/online/lighthouse-bar-grill","x":-150,"z":-515},
  {"id":"mill-valley-robata","name":"Robata Grill & Sushi","cityId":"mill-valley","areaId":"mill-valley","cuisine":"Japanese","cuisineIcon":"plate","signatureDish":"49er roll","address":"591 Redwood Highway, Mill Valley, CA 94941","sourceUrl":"https://order.toasttab.com/online/robata-grill-sushi/item-49er-roll_fe8d2a10-048b-44d2-9ecd-f84cd9771099","x":-130,"z":-515},
  {"id":"mill-valley-shoreline-coffee","name":"Shoreline Coffee Shop","cityId":"mill-valley","areaId":"mill-valley","cuisine":"Breakfast","cuisineIcon":"plate","signatureDish":"Tennessee Valley toast","address":"221 Shoreline Hwy, Mill Valley, CA 94941","sourceUrl":"https://www.toasttab.com/local/order/shoreline-coffee-shop-221-shoreline-hwy/item-tennessee-valley-toast_a2a1c729-c4cd-4d4a-9960-b704e09092f7","x":-210,"z":-500},
  {"id":"mill-valley-corner-bar","name":"Corner Bar","cityId":"mill-valley","areaId":"mill-valley","cuisine":"Mediterranean","cuisineIcon":"plate","signatureDish":"Sumac chicken sword","address":"106 Throckmorton Ave, Mill Valley, CA 94941","sourceUrl":"https://www.toasttab.com/local/order/the-corner-bar-mill-valley-106-throckmorton-ave/item-sumac-chicken-sword_cfe6402e-f413-48fc-a7d3-280e4e172aab","x":-125,"z":-495},
  {"id":"corte-madera-burmatown","name":"Burmatown","cityId":"corte-madera","areaId":"corte-madera","cuisine":"Burmese","cuisineIcon":"plate","signatureDish":"Burmatown bao","address":"18 Tamalpais Dr, Corte Madera, CA 94925","sourceUrl":"https://www.burmatown.com/","menuUrl":"https://www.burmatown.com/menu","x":-360,"z":-535},
  {"id":"corte-madera-pacific-catch","name":"Pacific Catch","cityId":"corte-madera","areaId":"corte-madera","cuisine":"Seafood","cuisineIcon":"bowl","signatureDish":"Original ahi poke","address":"133 Corte Madera Town Center, Corte Madera, CA 94925","sourceUrl":"https://www.pacificcatch.com/location/corte-madera/","menuUrl":"https://www.pacificcatch.com/menu/","x":-320,"z":-535},
  {"id":"corte-madera-roam","name":"Roam Artisan Burgers","cityId":"corte-madera","areaId":"corte-madera","cuisine":"Burgers","cuisineIcon":"burger","signatureDish":"The Classic Burger","address":"346 Corte Madera Town Center, Corte Madera, CA 94925","sourceUrl":"https://order.toasttab.com/online/roam-artisan-burgers-corte-madera","x":-300,"z":-535},
  {"id":"corte-madera-lighthouse","name":"Lighthouse Cafe","cityId":"corte-madera","areaId":"corte-madera","cuisine":"Danish and American","cuisineIcon":"plate","signatureDish":"Danish meatballs plate","address":"12 Tamalpais Dr, Corte Madera, CA 94925","sourceUrl":"https://order.toasttab.com/online/lighthouse-cafe-corte-madera","x":-280,"z":-535},
  {"id":"corte-madera-boca","name":"Boca Pizzeria","cityId":"corte-madera","areaId":"corte-madera","cuisine":"Italian","cuisineIcon":"noodles","signatureDish":"Braised short ribs pappardelle","address":"1544 Redwood Highway, Corte Madera, CA 94925","sourceUrl":"https://order.toasttab.com/online/bocapizzeriacortemadera/item-braised-short-ribs-pappardelle_7ededef1-683f-45ec-8ddb-e802ccf3ed52","x":-270,"z":-506},
  {"id":"corte-madera-flores","name":"Flores","cityId":"corte-madera","areaId":"corte-madera","cuisine":"Mexican","cuisineIcon":"taco","signatureDish":"Carnitas burrito","address":"301 Corte Madera Town Center, Corte Madera, CA 94925","sourceUrl":"https://order.toasttab.com/online/flores-corte-madera","x":-395,"z":-500},
  {"id":"corte-madera-super-duper","name":"Super Duper Burgers","cityId":"corte-madera","areaId":"corte-madera","cuisine":"Burgers","cuisineIcon":"burger","signatureDish":"Philly jalapeño burger","address":"5839 Paradise Dr, Corte Madera, CA 94925","sourceUrl":"https://order.toasttab.com/online/super-duper-corte-madera","x":-395,"z":-460},
  {"id":"corte-madera-pig-in-pickle","name":"Pig in a Pickle BBQ","cityId":"corte-madera","areaId":"corte-madera","cuisine":"Barbecue","cuisineIcon":"plate","signatureDish":"Beef brisket","address":"341 Corte Madera Town Center, Corte Madera, CA 94925","sourceUrl":"https://www.toasttab.com/local/order/pig-in-a-pickle-corte-madera-341-corte-madera-town-center/item-beef-brisket_11ccf782-f76f-4fff-889c-f79faf758e27","x":-375,"z":-455},
  {"id":"corte-madera-fieldwork","name":"Fieldwork Brewing","cityId":"corte-madera","areaId":"corte-madera","cuisine":"California","cuisineIcon":"sandwich","signatureDish":"Chicken Caesar wrap","address":"107 Corte Madera Town Center, Corte Madera, CA 94925","sourceUrl":"https://www.toasttab.com/local/order/fieldwork-brewing-corte-madera/item-chicken-caesar-wrap_457ed9da-8ee3-4071-90ad-7a8f58b03491","x":-395,"z":-440},
  {"id":"mill-valley-watershed","name":"Watershed","cityId":"mill-valley","areaId":"mill-valley","cuisine":"California","cuisineIcon":"bowl","signatureDish":"Caldo de pollo","address":"129 Miller Ave, Mill Valley, CA 94941","sourceUrl":"https://order.toasttab.com/online/watershed","x":-234,"z":-540},
  {"id":"corte-madera-cafe-verde","name":"Cafe Verde Pizzeria & Ristorante","cityId":"corte-madera","areaId":"corte-madera","cuisine":"Italian","cuisineIcon":"pizza","signatureDish":"Pizza Tre Colore","address":"502 Tamalpais Dr, Corte Madera, CA 94925","sourceUrl":"https://order.toasttab.com/online/cafe-verde-pizzeria-ristorante-502-tamalpais-dr","x":-270,"z":-486},
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
  {"id":"customer-mill-valley-01","name":"Tamalpais Sketch Club · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-210,"y":0,"z":-475,"rooftop":false},
  {"id":"customer-mill-valley-02","name":"Miller Avenue Potters · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-125,"y":0,"z":-470,"rooftop":false},
  {"id":"customer-mill-valley-03","name":"Redwood Creek Music Room · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-140,"y":0,"z":-460,"rooftop":false},
  {"id":"customer-mill-valley-04","name":"Cascade Trail Makers · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-210,"y":0,"z":-455,"rooftop":false},
  {"id":"customer-mill-valley-05","name":"Throckmorton Book Club · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-210,"y":0,"z":-435,"rooftop":false},
  {"id":"customer-mill-valley-06","name":"Mill Valley Bicycle Studio · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-180,"y":0,"z":-430,"rooftop":false},
  {"id":"customer-mill-valley-07","name":"Muir Woods Film Lab · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-254,"y":0,"z":-540,"rooftop":false},
  {"id":"customer-mill-valley-08","name":"Sycamore Gardeners · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-210,"y":0,"z":-410,"rooftop":false},
  {"id":"customer-mill-valley-09","name":"Strawberry Point Print Shop · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-255,"y":0,"z":-395,"rooftop":false},
  {"id":"customer-corte-madera-01","name":"Marshside Makers · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-375,"y":0,"z":-435,"rooftop":false},
  {"id":"customer-corte-madera-02","name":"Tamalpais Print Studio · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-395,"y":0,"z":-420,"rooftop":false},
  {"id":"customer-corte-madera-03","name":"Bayfront Bird Club · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-375,"y":0,"z":-415,"rooftop":false},
  {"id":"customer-corte-madera-04","name":"Paradise Gardeners · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-355,"y":0,"z":-410,"rooftop":false},
  {"id":"customer-corte-madera-05","name":"Town Center Book Club · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-265,"y":0,"z":-410,"rooftop":false},
  {"id":"customer-corte-madera-06","name":"Corte Madera Cinema Club · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-345,"y":0,"z":-395,"rooftop":false},
  {"id":"customer-corte-madera-07","name":"Redwood Landing Workshop · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-325,"y":0,"z":-395,"rooftop":false},
  {"id":"customer-corte-madera-08","name":"Lagoon Sketch Society · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-300,"y":0,"z":-395,"rooftop":false},
  {"id":"customer-corte-madera-09","name":"Creekside Music Room · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-275,"y":0,"z":-395,"rooftop":false},
  {"id":"customer-mill-valley-10","name":"Alpine Meadow Muralists · Mill Valley","cityId":"mill-valley","areaId":"mill-valley","x":-214,"y":0,"z":-540,"rooftop":false},
  {"id":"customer-corte-madera-10","name":"Marsh Trail Muralists · Corte Madera","cityId":"corte-madera","areaId":"corte-madera","x":-270,"y":0,"z":-466,"rooftop":false},
];
