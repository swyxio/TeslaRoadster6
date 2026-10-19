/** Source-backed restaurant details for catalog verification; gameplay uses delivery-locations.ts. */
export type RestaurantResearch = {address:string;cuisine:string;signatureDish:string;sourceUrl:string;menuUrl?:string};
export const RESTAURANT_RESEARCH:Readonly<Record<string,RestaurantResearch>> = {
  "tartine": {
    "address": "600 Guerrero St, San Francisco",
    "cuisine": "San Francisco bakery",
    "signatureDish": "Country bread",
    "sourceUrl": "https://tartinebakery.com/san-francisco/bakery"
  },
  "tonys": {
    "address": "1570 Stockton St, San Francisco",
    "cuisine": "Pizza",
    "signatureDish": "Margherita pizza",
    "sourceUrl": "https://tonyspizzanapoletana.com/location/"
  },
  "burma": {
    "address": "309 Clement St, San Francisco",
    "cuisine": "Burmese",
    "signatureDish": "Tea leaf salad",
    "sourceUrl": "https://www.burmasuperstar.com/",
    "menuUrl": "https://www.burmasuperstar.com/s/BurmaTakeoutMenu_2022_01_10_Optimized-3xxj.pdf"
  },
  "nanking": {
    "address": "919 Kearny St, San Francisco",
    "cuisine": "Chinese",
    "signatureDish": "Nanking sesame chicken",
    "sourceUrl": "https://houseofnanking.net/",
    "menuUrl": "https://www.houseofnankingsf.com/menu/"
  },
  "homeroom": {
    "address": "4007 Webster St, Oakland",
    "cuisine": "American",
    "signatureDish": "Mac and cheese",
    "sourceUrl": "https://www.homeroom510.com/locations"
  },
  "comal": {
    "address": "550 Grand Ave, Oakland",
    "cuisine": "Mexican",
    "signatureDish": "Carnitas burrito",
    "sourceUrl": "https://www.comalnextdoor.com/location/comal-next-door-oakland/"
  },
  "san-francisco-montesacro": {
    "address": "510 Stevenson St, San Francisco, CA 94103",
    "cuisine": "Roman Italian",
    "signatureDish": "San Lorenzo pinsa",
    "sourceUrl": "https://www.toasttab.com/local/order/montesacro-soma-510-stevenson-street/item-marinated-vegetables_189a7272-e9d1-4297-95fc-1d94ad3daf90"
  },
  "san-francisco-dabao": {
    "address": "135 4th St, FC03, San Francisco, CA 94103",
    "cuisine": "Singaporean",
    "signatureDish": "Hainanese chicken rice",
    "sourceUrl": "https://www.toasttab.com/local/order/dabao-singapore-135-4th-st-fc03/item-chili-crab_a6b00e66-0998-4025-85b7-df3be5970343"
  },
  "san-francisco-basil-thai": {
    "address": "1175 Folsom St, San Francisco, CA 94103",
    "cuisine": "Thai",
    "signatureDish": "Pad see ew",
    "sourceUrl": "https://www.toasttab.com/local/order/basil-thai-restaurant-1175-folsom-street/item-utensil_82f3e24a-eb1e-4bbd-baab-1914f029e7e1"
  },
  "san-francisco-el-rey": {
    "address": "2491 Mission St, San Francisco, CA 94110",
    "cuisine": "Mexican",
    "signatureDish": "Burrito super",
    "sourceUrl": "https://www.toasttab.com/local/order/el-rey-taquiza-artesanal-2491-mission-street/item-lagunitas-hazy_d7663256-8ad6-45f8-948b-bb69dabcf17b"
  },
  "san-francisco-el-buen-comer": {
    "address": "3435 Mission St, San Francisco, CA 94110",
    "cuisine": "Mexican",
    "signatureDish": "Cheese enchiladas",
    "sourceUrl": "https://www.toasttab.com/local/order/el-buen-comer-3435-mission-st/item-tortas_6b40c981-616f-4fd5-914a-4eed29565c14"
  },
  "san-francisco-yuja": {
    "address": "396 Harrison St, San Francisco, CA 94105",
    "cuisine": "Asian fusion",
    "signatureDish": "Yuja teriyaki",
    "sourceUrl": "https://www.toasttab.com/local/order/yuja-396-harrison-street/item-tofu-tonkatsu_9ecf00ac-bc92-4c7a-a51d-1fcb2b741ac1"
  },
  "oakland-saints": {
    "address": "218 13th St, Oakland, CA 94612",
    "cuisine": "Barbecue",
    "signatureDish": "Smoked pork rib plate",
    "sourceUrl": "https://www.saintssmokehouse.com/"
  },
  "oakland-stay-gold": {
    "address": "2635 San Pablo Ave, Oakland, CA 94612",
    "cuisine": "Barbecue",
    "signatureDish": "Brisket sandwich",
    "sourceUrl": "https://mymurph8.wixsite.com/stay-gold-deli-5/online-ordering"
  },
  "oakland-cafe-dareye": {
    "address": "2504 Telegraph Ave, Oakland, CA 94612",
    "cuisine": "Ethiopian",
    "signatureDish": "Ethiopian vegan platter",
    "sourceUrl": "https://www.toasttab.com/local/order/cafe-dareye/item-injera_74d863b3-e2c2-4f98-8867-201f25ad712e"
  },
  "oakland-todos": {
    "address": "2315 Valdez St, Oakland, CA 94612",
    "cuisine": "Mexican",
    "signatureDish": "Baja fish taco",
    "sourceUrl": "https://www.toasttab.com/local/order/todos/item-orange-juice_eacbe13c-202d-4da3-8ace-c0fe24312c79"
  },
  "oakland-que-rico": {
    "address": "381 15th St, Oakland, CA 94612",
    "cuisine": "Mexican",
    "signatureDish": "Al pastor street tacos",
    "sourceUrl": "https://order.toasttab.com/online/que-rico-oakland-381-15th-street/item-1-street-tacos_98dc548b-6f27-42d4-8841-a768ca1a9b25"
  },
  "oakland-shooting-star": {
    "address": "1022 Webster St, Oakland, CA 94607",
    "cuisine": "Cantonese",
    "signatureDish": "Baked cream pork chop",
    "sourceUrl": "https://www.shootingstarhkcafe.com/"
  },
  "oakland-spices-3": {
    "address": "372 12th St, Oakland, CA 94607",
    "cuisine": "Sichuan",
    "signatureDish": "Ma-Po tofu",
    "sourceUrl": "https://spices3-oakland.com/"
  },
  "oakland-tay-ho": {
    "address": "344 12th St, Oakland, CA 94607",
    "cuisine": "Vietnamese",
    "signatureDish": "Classic chicken pho",
    "sourceUrl": "https://tayhooakland.com/en-US"
  },
  "berkeley-cheese-board": {
    "address": "1512 Shattuck Ave, Berkeley, CA 94709",
    "cuisine": "Vegetarian pizza",
    "signatureDish": "Pizza of the day",
    "sourceUrl": "https://cheeseboardcollective.coop/directions-hours/contact-us/"
  },
  "berkeley-angelines": {
    "address": "2261 Shattuck Ave, Berkeley, CA 94704",
    "cuisine": "Louisiana",
    "signatureDish": "Voo Doo shrimp",
    "sourceUrl": "https://order.toasttab.com/online/angelines-louisiana-kitchen-2261-shattuck-ave"
  },
  "berkeley-jupiter": {
    "address": "2181 Shattuck Ave, Berkeley, CA 94704",
    "cuisine": "Wood-fired pizza",
    "signatureDish": "Wood-fired pizza",
    "sourceUrl": "https://www.jupiterbeer.com/"
  },
  "berkeley-sliver": {
    "address": "2174 Shattuck Ave, Berkeley, CA 94704",
    "cuisine": "Vegetarian pizza",
    "signatureDish": "Pizza of the day",
    "sourceUrl": "https://www.toasttab.com/local/order/sliver-pizzeria-shattuck-2174-shattuck-ave/item-coke-zero_120e3668-2df3-4edc-a314-89968dd81677"
  },
  "berkeley-original-pollo": {
    "address": "2101 Shattuck Ave, Berkeley, CA 94704",
    "cuisine": "Chicken",
    "signatureDish": "BBQ chicken",
    "sourceUrl": "https://www.originalpollo.com/"
  },
  "berkeley-espresso": {
    "address": "1900 Shattuck Ave, Berkeley, CA 94704",
    "cuisine": "Cafe",
    "signatureDish": "Lox bagel",
    "sourceUrl": "https://www.berkeleyespresso.com/"
  },
  "berkeley-fish-and-bird": {
    "address": "2451 Shattuck Ave, Berkeley, CA 94704",
    "cuisine": "Japanese",
    "signatureDish": "Chicken karaage with rice",
    "sourceUrl": "https://www.toasttab.com/local/order/fish-bird-sousaku-izakaya/item-steelhead-nabe-large_c5837c42-0b92-4964-bf42-68d3d195c77d"
  },
  "berkeley-raleighs-mezzo": {
    "address": "2442 Telegraph Ave, Berkeley, CA 94704",
    "cuisine": "Cafe",
    "signatureDish": "Breakfast burrito",
    "sourceUrl": "https://www.toasttab.com/local/order/mezzo/item-12-pbhb-sandwich-cup-of-soup-online-to-go_9f3492b2-dd41-4357-a6aa-858cb82d14f4"
  },
  "berkeley-bigotes": {
    "address": "1706 University Ave, Berkeley, CA 94703",
    "cuisine": "Pizza",
    "signatureDish": "Bigotes special sandwich",
    "sourceUrl": "https://www.toasttab.com/local/order/bigotespizza/item-you-make-it-we-bake-it-small_7c950166-e556-444f-8a14-08a789b62776"
  },
  "berkeley-la-note": {
    "address": "2377 Shattuck Ave, Berkeley, CA 94704",
    "cuisine": "French Provençal",
    "signatureDish": "Potato and caramelized onion omelette",
    "sourceUrl": "https://www.lanoterestaurant.com/menu",
    "menuUrl": "https://order.online/store/la-note-1375843"
  },
  "emeryville-townhouse": {
    "address": "5862 Doyle St, Emeryville, CA 94608",
    "cuisine": "California",
    "signatureDish": "Baby back ribs",
    "sourceUrl": "https://townhouseemeryville.com/"
  },
  "emeryville-honor": {
    "address": "1411 Powell St, Emeryville, CA 94608",
    "cuisine": "California",
    "signatureDish": "Seared ahi tuna bowl",
    "sourceUrl": "https://www.toasttab.com/local/order/honor-kitchen-cocktails/item-seared-ahi-tuna-bowl_d73fc85a-ee30-4e42-b493-ffc3e4f7d383"
  },
  "emeryville-rudys": {
    "address": "4081 Hollis St, Emeryville, CA 94608",
    "cuisine": "Diner",
    "signatureDish": "Green Eggs and Ham",
    "sourceUrl": "https://www.toasttab.com/local/order/rudys-emeryville-4081-hollis-street/item-cheese-quesadilla_68f69d7e-f767-4db2-9ae7-e3dab8aa8860"
  },
  "emeryville-demiya": {
    "address": "5959 Shellmound St, Kiosk 2, Emeryville, CA 94608",
    "cuisine": "Japanese curry",
    "signatureDish": "Ebi tempura curry rice",
    "sourceUrl": "https://www.toasttab.com/local/order/demiya-emeryville-5959-shellmound-street/item-5-ebi-tempura-curry-rice_f619aef2-224c-444b-af8c-1ff6a3c3f75a"
  },
  "emeryville-flores": {
    "address": "5614 Bay St, Suite 244, Emeryville, CA 94608",
    "cuisine": "Mexican",
    "signatureDish": "Chili colorado taco",
    "sourceUrl": "https://www.toasttab.com/local/order/flores-taqueria-emeryville/item-agua-fresca_d0ccc568-0826-482a-ba23-4ac6766dc396"
  },
  "emeryville-doyle": {
    "address": "5515 Doyle St, Emeryville, CA 94608",
    "cuisine": "Breakfast",
    "signatureDish": "Breakfast burrito",
    "sourceUrl": "https://www.toasttab.com/local/order/doyle-street-cafe-5515-doyle-street/item-chinese-chicken-salad_9e05a027-fb00-4c67-b9c0-d1b35d4d9c0c"
  },
  "emeryville-los-moles": {
    "address": "1320 65th St, Emeryville, CA 94608",
    "cuisine": "Mexican",
    "signatureDish": "Mole poblano",
    "sourceUrl": "https://www.toasttab.com/local/order/los-moles-emeryville-1320-65th-street/item-los-moles-buffet_c24154c7-875b-4b15-bc64-3a6f0c029d4c"
  },
  "emeryville-paradita": {
    "address": "5959 Shellmound St, Suite 1, Emeryville, CA 94608",
    "cuisine": "Peruvian",
    "signatureDish": "Lomito bowl",
    "sourceUrl": "https://www.toasttab.com/local/order/paradita/item-hh-bohemia_7fa35f81-ad2c-4270-b915-ae6c37b0a236"
  },
  "emeryville-senor-pico": {
    "address": "9 Anchor Dr, Emeryville, CA 94608",
    "cuisine": "Mexican",
    "signatureDish": "Beef barbacoa taco",
    "sourceUrl": "https://senorpico.com/bay-area/",
    "menuUrl": "https://senorpico.com/bay-area/mexican-food-menu/"
  },
  "emeryville-good-to-eat": {
    "address": "1298 65th St, Emeryville, CA 94608",
    "cuisine": "Taiwanese",
    "signatureDish": "Fu-Ru fried chicken",
    "sourceUrl": "https://www.wearegoodtoeat.com/menu"
  },
  "mill-valley-stefanos": {
    "address": "11 E Blithedale Ave, Mill Valley, CA 94941",
    "cuisine": "Pizza",
    "signatureDish": "Portuguese pizza",
    "sourceUrl": "https://www.stefanosmillvalley.com/"
  },
  "mill-valley-piazza-dangelo": {
    "address": "22 Miller Ave, Mill Valley, CA 94941",
    "cuisine": "Italian",
    "signatureDish": "Fettuccine alla Bolognese",
    "sourceUrl": "https://piazzadangelo.com/mill-valley-piazza-d-angelo-food-menu"
  },
  "mill-valley-tam-tavern": {
    "address": "152 Shoreline Highway, Mill Valley, CA 94941",
    "cuisine": "American",
    "signatureDish": "Tavern cheeseburger",
    "sourceUrl": "https://tamtavernmv.com/",
    "menuUrl": "https://toast.app/r/floodwater-restaurant-mill-valley-152-shoreline-highway/order"
  },
  "mill-valley-playa": {
    "address": "41 Throckmorton Ave, Mill Valley, CA 94941",
    "cuisine": "Mexican",
    "signatureDish": "Pollo al carbón",
    "sourceUrl": "https://www.toasttab.com/local/order/playa-mill-valley-41-throckmorton-ave/item-pollo-al-carbon-to-go_e764ec6b-d4c6-4b2b-9305-0118b2546597"
  },
  "mill-valley-piatti": {
    "address": "625 Redwood Highway, Mill Valley, CA 94941",
    "cuisine": "Italian",
    "signatureDish": "Cioppino",
    "sourceUrl": "https://www.toasttab.com/local/order/piatti-mill-valley/item-cioppino_d605bbb0-3002-4796-a8bb-219880c679a1"
  },
  "mill-valley-lighthouse": {
    "address": "475 E Strawberry Dr, Mill Valley, CA 94941",
    "cuisine": "American",
    "signatureDish": "California club",
    "sourceUrl": "https://order.toasttab.com/online/lighthouse-bar-grill"
  },
  "mill-valley-robata": {
    "address": "591 Redwood Highway, Mill Valley, CA 94941",
    "cuisine": "Japanese",
    "signatureDish": "49er roll",
    "sourceUrl": "https://order.toasttab.com/online/robata-grill-sushi/item-49er-roll_fe8d2a10-048b-44d2-9ecd-f84cd9771099"
  },
  "mill-valley-shoreline-coffee": {
    "address": "221 Shoreline Hwy, Mill Valley, CA 94941",
    "cuisine": "Breakfast",
    "signatureDish": "Tennessee Valley toast",
    "sourceUrl": "https://www.toasttab.com/local/order/shoreline-coffee-shop-221-shoreline-hwy/item-tennessee-valley-toast_a2a1c729-c4cd-4d4a-9960-b704e09092f7"
  },
  "mill-valley-corner-bar": {
    "address": "106 Throckmorton Ave, Mill Valley, CA 94941",
    "cuisine": "Mediterranean",
    "signatureDish": "Sumac chicken sword",
    "sourceUrl": "https://www.toasttab.com/local/order/the-corner-bar-mill-valley-106-throckmorton-ave/item-sumac-chicken-sword_cfe6402e-f413-48fc-a7d3-280e4e172aab"
  },
  "corte-madera-burmatown": {
    "address": "18 Tamalpais Dr, Corte Madera, CA 94925",
    "cuisine": "Burmese",
    "signatureDish": "Burmatown bao",
    "sourceUrl": "https://www.burmatown.com/",
    "menuUrl": "https://www.burmatown.com/menu"
  },
  "corte-madera-pacific-catch": {
    "address": "133 Corte Madera Town Center, Corte Madera, CA 94925",
    "cuisine": "Seafood",
    "signatureDish": "Original ahi poke",
    "sourceUrl": "https://www.pacificcatch.com/location/corte-madera/",
    "menuUrl": "https://www.pacificcatch.com/menu/"
  },
  "corte-madera-roam": {
    "address": "346 Corte Madera Town Center, Corte Madera, CA 94925",
    "cuisine": "Burgers",
    "signatureDish": "The Classic Burger",
    "sourceUrl": "https://order.toasttab.com/online/roam-artisan-burgers-corte-madera"
  },
  "corte-madera-lighthouse": {
    "address": "12 Tamalpais Dr, Corte Madera, CA 94925",
    "cuisine": "Danish and American",
    "signatureDish": "Danish meatballs plate",
    "sourceUrl": "https://order.toasttab.com/online/lighthouse-cafe-corte-madera"
  },
  "corte-madera-boca": {
    "address": "1544 Redwood Highway, Corte Madera, CA 94925",
    "cuisine": "Italian",
    "signatureDish": "Braised short ribs pappardelle",
    "sourceUrl": "https://order.toasttab.com/online/bocapizzeriacortemadera/item-braised-short-ribs-pappardelle_7ededef1-683f-45ec-8ddb-e802ccf3ed52"
  },
  "corte-madera-flores": {
    "address": "301 Corte Madera Town Center, Corte Madera, CA 94925",
    "cuisine": "Mexican",
    "signatureDish": "Carnitas burrito",
    "sourceUrl": "https://order.toasttab.com/online/flores-corte-madera"
  },
  "corte-madera-super-duper": {
    "address": "5839 Paradise Dr, Corte Madera, CA 94925",
    "cuisine": "Burgers",
    "signatureDish": "Philly jalapeño burger",
    "sourceUrl": "https://order.toasttab.com/online/super-duper-corte-madera"
  },
  "corte-madera-pig-in-pickle": {
    "address": "341 Corte Madera Town Center, Corte Madera, CA 94925",
    "cuisine": "Barbecue",
    "signatureDish": "Beef brisket",
    "sourceUrl": "https://www.toasttab.com/local/order/pig-in-a-pickle-corte-madera-341-corte-madera-town-center/item-beef-brisket_11ccf782-f76f-4fff-889c-f79faf758e27"
  },
  "corte-madera-fieldwork": {
    "address": "107 Corte Madera Town Center, Corte Madera, CA 94925",
    "cuisine": "California",
    "signatureDish": "Chicken Caesar wrap",
    "sourceUrl": "https://www.toasttab.com/local/order/fieldwork-brewing-corte-madera/item-chicken-caesar-wrap_457ed9da-8ee3-4071-90ad-7a8f58b03491"
  },
  "mill-valley-watershed": {
    "address": "129 Miller Ave, Mill Valley, CA 94941",
    "cuisine": "California",
    "signatureDish": "Caldo de pollo",
    "sourceUrl": "https://order.toasttab.com/online/watershed"
  },
  "corte-madera-cafe-verde": {
    "address": "502 Tamalpais Dr, Corte Madera, CA 94925",
    "cuisine": "Italian",
    "signatureDish": "Pizza Tre Colore",
    "sourceUrl": "https://order.toasttab.com/online/cafe-verde-pizzeria-ristorante-502-tamalpais-dr"
  },
  "south-san-francisco-little-lucca": {
    "address": "724 El Camino Real, South San Francisco, CA 94080",
    "cuisine": "Sandwiches",
    "signatureDish": "Lucca combo sandwich",
    "sourceUrl": "https://southcity.littlelucca.com/"
  },
  "south-san-francisco-curry-corner": {
    "address": "600 Linden Ave, South San Francisco, CA 94080",
    "cuisine": "Indian and pizza",
    "signatureDish": "Chicken tikka masala pizza",
    "sourceUrl": "https://currycornerssf.com/"
  },
  "south-san-francisco-la-guera": {
    "address": "1 Orange Ave, South San Francisco, CA 94080",
    "cuisine": "Mexican",
    "signatureDish": "Street tacos",
    "sourceUrl": "https://www.lagueratacos.com/"
  },
  "south-san-francisco-luigis": {
    "address": "280 Harbor Way, South San Francisco, CA 94080",
    "cuisine": "Sandwiches",
    "signatureDish": "Mimi's roasted turkey",
    "sourceUrl": "https://luigissandwichpalace.com/"
  },
  "south-san-francisco-hidden-spot": {
    "address": "303 Grand Ave, South San Francisco, CA 94080",
    "cuisine": "Sandwiches",
    "signatureDish": "South sandwich",
    "sourceUrl": "https://order.toasttab.com/online/hidden-spot-so-sf-303-grand-avenue"
  },
  "south-san-francisco-omakase": {
    "address": "800 Gateway Blvd, South San Francisco, CA 94080",
    "cuisine": "Asian food hall",
    "signatureDish": "Chicken katsu sandwich",
    "sourceUrl": "https://order.toasttab.com/online/omakase-world-market"
  },
  "south-san-francisco-hula-hoops": {
    "address": "2278 Westborough Blvd, Suite 203, South San Francisco, CA 94080",
    "cuisine": "Hawaiian and Filipino",
    "signatureDish": "Sisig fried rice",
    "sourceUrl": "https://order.toasttab.com/online/hulahoopssf"
  },
  "south-san-francisco-wildflour": {
    "address": "200 Airport Blvd, Suite 1, South San Francisco, CA 94080",
    "cuisine": "California bakery",
    "signatureDish": "Buckwheat waffle with smoked trout",
    "sourceUrl": "https://order.toasttab.com/online/wild-flour-nro-200-airport-boulevard-suite-1"
  },
  "south-san-francisco-boracay": {
    "address": "269 El Camino Real, South San Francisco, CA 94080",
    "cuisine": "Filipino",
    "signatureDish": "Crispy pata",
    "sourceUrl": "https://www.boracayrestaurant.com/"
  },
  "south-san-francisco-maxs": {
    "address": "1155 El Camino Real, South San Francisco, CA 94080",
    "cuisine": "Filipino",
    "signatureDish": "Fried chicken",
    "sourceUrl": "https://www.maxsrestaurantna.com/south-san-francisco"
  },
  "san-mateo-taste-and-glory": {
    "address": "1208 South El Camino Real, San Mateo, CA",
    "cuisine": "American brunch",
    "signatureDish": "Chicken Croffle",
    "sourceUrl": "https://order.toasttab.com/online/taste-and-glory-nro-1208-south-el-camino-real"
  },
  "san-mateo-rise-woodfire": {
    "address": "2 N B St, San Mateo, CA",
    "cuisine": "Pizza and rotisserie",
    "signatureDish": "Margherita Pizza",
    "sourceUrl": "https://order.toasttab.com/online/risewoodfire"
  },
  "san-mateo-the-breakfast-club": {
    "address": "3035 South Delaware Street, San Mateo, CA",
    "cuisine": "American breakfast",
    "signatureDish": "Loco Moco",
    "sourceUrl": "https://order.toasttab.com/online/the-breakfast-club-san-mateo"
  },
  "san-mateo-mateo-pizza": {
    "address": "851 North San Mateo Drive, San Mateo, CA",
    "cuisine": "Pizza and Turkish",
    "signatureDish": "Roasted Beef Pide",
    "sourceUrl": "https://order.toasttab.com/online/mateo-pizza-851-north-san-mateo-drive"
  },
  "san-mateo-pausa-bar-cookery": {
    "address": "223 E 4th Ave, San Mateo, CA",
    "cuisine": "Italian",
    "signatureDish": "Pizza Salsiccia",
    "sourceUrl": "https://order.toasttab.com/online/pausa-bar-cookery-san-mateo-223-e-4th-ave"
  },
  "san-mateo-johnny-s": {
    "address": "7 N B St, San Mateo, CA",
    "cuisine": "American breakfast",
    "signatureDish": "Lemon Ricotta Pancakes",
    "sourceUrl": "https://order.toasttab.com/online/johnnys-san-mateo"
  },
  "san-mateo-hironori": {
    "address": "211 E 3rd Ave, San Mateo, CA",
    "cuisine": "Japanese ramen",
    "signatureDish": "Tonkotsu Ramen",
    "sourceUrl": "https://order.online/store/HiroNoriCraftRamen-24674409"
  },
  "san-mateo-foreigner": {
    "address": "60 East 3rd Avenue, San Mateo, CA",
    "cuisine": "Cafe",
    "signatureDish": "Turkey BLT Sandwich",
    "sourceUrl": "https://order.toasttab.com/online/foreigner-60-east-3rd-avenue"
  },
  "san-mateo-backhaus": {
    "address": "32 3rd Avenue, San Mateo, CA",
    "cuisine": "Bakery",
    "signatureDish": "Ham & Cheese Croissant",
    "sourceUrl": "https://www.backhausbread.com/menu"
  },
  "san-mateo-curry-up-now": {
    "address": "129 S B St, San Mateo, CA",
    "cuisine": "Indian street food",
    "signatureDish": "Tikka Masala Burrito",
    "sourceUrl": "https://www.curryupnow.com/san-mateo"
  },
  "redwood-city-corner-table": {
    "address": "20 Woodside Plaza, Redwood City, CA",
    "cuisine": "Korean",
    "signatureDish": "Bulgogi Bibimbap",
    "sourceUrl": "https://order.toasttab.com/online/cornertable"
  },
  "redwood-city-kemuri-japanese-bar": {
    "address": "2616 Broadway, Redwood City, CA",
    "cuisine": "Japanese",
    "signatureDish": "Kemuri Udon",
    "sourceUrl": "https://order.toasttab.com/online/kemurirwc"
  },
  "redwood-city-timber-salt": {
    "address": "881 Middlefield Rd, Redwood City, CA",
    "cuisine": "American",
    "signatureDish": "Wagyu Double Smash Burger",
    "sourceUrl": "https://order.toasttab.com/online/timber-salt-881-middlefield-rd"
  },
  "redwood-city-comalito": {
    "address": "3143 Middlefield Rd, Redwood City, CA",
    "cuisine": "Salvadoran",
    "signatureDish": "Pupusa Plate",
    "sourceUrl": "https://order.toasttab.com/online/comalito"
  },
  "redwood-city-pamilya": {
    "address": "756 Woodside Rd, Redwood City, CA",
    "cuisine": "Filipino",
    "signatureDish": "Pancit",
    "sourceUrl": "https://order.toasttab.com/online/pamilya-756-woodside-rd"
  },
  "redwood-city-mistral": {
    "address": "370 Bridge Parkway Suite 6, Redwood City, CA",
    "cuisine": "California and Mediterranean",
    "signatureDish": "Margherita Pizza",
    "sourceUrl": "https://order.toasttab.com/online/mistral-restaurant-370-bridge-parkway-suite-6"
  },
  "redwood-city-eskina": {
    "address": "3101 Middlefield Rd, Redwood City, CA",
    "cuisine": "Breakfast",
    "signatureDish": "Super Hungry Breakfast",
    "sourceUrl": "https://order.toasttab.com/online/eskina-3101-middlefield-rd"
  },
  "redwood-city-pizzeria-cardamomo": {
    "address": "2053A Broadway, Redwood City, CA",
    "cuisine": "Italian pizza",
    "signatureDish": "Momo Pizza",
    "sourceUrl": "https://pizzeriacardamomo.com/menu"
  },
  "redwood-city-vesta": {
    "address": "2022 Broadway Street, Redwood City, CA",
    "cuisine": "Italian pizza",
    "signatureDish": "Sausage & Honey Pizza",
    "sourceUrl": "https://order.toasttab.com/online/vestarwc/item-sausage-honey-pizza_a773079d-fa7a-4554-b1fa-ad21bd67022a"
  },
  "redwood-city-milagros": {
    "address": "1099 Middlefield Road, Redwood City, CA",
    "cuisine": "Mexican",
    "signatureDish": "Milagros Burrito Mojado",
    "sourceUrl": "https://order.toasttab.com/online/milagros-redwood-city-1099-middlefield-road"
  },
  "menlo-park-tilak-indian-cuisine": {
    "address": "683 Santa Cruz Ave, Menlo Park, CA",
    "cuisine": "Indian",
    "signatureDish": "Chicken Korma",
    "sourceUrl": "https://order.toasttab.com/online/tilak-indian-cusine-nbcgr"
  },
  "menlo-park-burma-love": {
    "address": "1302 El Camino Real Ste E, Menlo Park, CA",
    "cuisine": "Burmese",
    "signatureDish": "Laphet Tea Leaf Salad",
    "sourceUrl": "https://order.toasttab.com/online/burma-love-menlo-park"
  },
  "menlo-park-stacks": {
    "address": "600 Santa Cruz Ave, Menlo Park, CA",
    "cuisine": "American breakfast",
    "signatureDish": "Farmers Breakfast",
    "sourceUrl": "https://order.toasttab.com/online/stacks-menlo-park-600-santa-cruz-ave"
  },
  "menlo-park-cafe-borrone": {
    "address": "1010 El Camino Real Ste 110, Menlo Park, CA",
    "cuisine": "Cafe",
    "signatureDish": "Breakfast (OG) Wrap",
    "sourceUrl": "https://order.toasttab.com/online/cafe-borrone-1010-el-camino-real-ste110"
  },
  "menlo-park-back-a-yard": {
    "address": "1189 Willow Rd, Menlo Park, CA",
    "cuisine": "Caribbean",
    "signatureDish": "Jerk Chicken & Beef Oxtail Plate",
    "sourceUrl": "https://backayard.net/"
  },
  "menlo-park-cook-s-seafood": {
    "address": "751 El Camino Real, Menlo Park, CA",
    "cuisine": "Seafood",
    "signatureDish": "Fish & Chips",
    "sourceUrl": "https://cooksseafood.com/pdfs/menu-restaurant.pdf"
  },
  "menlo-park-jeffrey-s-hamburgers": {
    "address": "888 El Camino Real, Menlo Park, CA",
    "cuisine": "American burgers",
    "signatureDish": "Hamburger",
    "sourceUrl": "https://www.jeffreyshamburgers.com/locations",
    "menuUrl": "https://jeffreyshamburgers.com/assets/images/jeffreys_hamburgers_togo.pdf"
  },
  "menlo-park-dutch-goose": {
    "address": "3567 Alameda de las Pulgas, Menlo Park, CA",
    "cuisine": "American",
    "signatureDish": "Spicy Deviled Eggs",
    "sourceUrl": "https://www.dutchgoose.net/files/dutch-goose-menu-new-pdf.pdf"
  },
  "menlo-park-neighborhood-pizza-guy-cafe-zoe": {
    "address": "1929 Menalto Ave, Menlo Park, CA",
    "cuisine": "Pizza",
    "signatureDish": "Pizza Lab",
    "sourceUrl": "https://neighborhood.pizza/order/neighborhood-pizza/item-pizza-lab_57fcbf1d-fa22-4f26-b706-17cf9d105897"
  },
  "menlo-park-sultana-mediterranean": {
    "address": "1149 El Camino Real, Menlo Park, CA",
    "cuisine": "Turkish",
    "signatureDish": "Pomegranate Kebab",
    "sourceUrl": "https://thesultana.net/",
    "menuUrl": "https://order.toasttab.com/online/sultana-1149-el-camino-real"
  },
  "palo-alto-pizzeria-delfina": {
    "address": "651 Emerson St, Palo Alto, CA",
    "cuisine": "Italian pizza",
    "signatureDish": "Salsiccia",
    "sourceUrl": "https://order.toasttab.com/online/pizzeria-delfina-palo-alto"
  },
  "palo-alto-wildseed": {
    "address": "855 El Camino Real Suite 110, Palo Alto, CA",
    "cuisine": "Plant-based",
    "signatureDish": "Mezze Plate",
    "sourceUrl": "https://www.wildseedsf.com/location/wildseed-palo-alto/"
  },
  "palo-alto-sweet-maple": {
    "address": "150 University Ave, Palo Alto, CA",
    "cuisine": "American breakfast",
    "signatureDish": "Chicken Croffle",
    "sourceUrl": "https://order.toasttab.com/online/sweet-maple-palo-alto"
  },
  "palo-alto-the-farm-fresh": {
    "address": "2450 Park Blvd, Palo Alto, CA",
    "cuisine": "Cafe",
    "signatureDish": "Chicken Wrap",
    "sourceUrl": "https://order.toasttab.com/online/the-farm-fresh-2450-park-blvd"
  },
  "palo-alto-sprout-cafe": {
    "address": "168 University Avenue, Palo Alto, CA",
    "cuisine": "Cafe",
    "signatureDish": "Chipotle Chicken",
    "sourceUrl": "https://order.toasttab.com/online/cafe-sprout-168-university-avenue"
  },
  "palo-alto-hatched": {
    "address": "855 El Camino Real Suite 161, Palo Alto, CA",
    "cuisine": "American breakfast",
    "signatureDish": "Green Dream",
    "sourceUrl": "https://order.toasttab.com/online/hatched"
  },
  "palo-alto-mediterranean-wraps": {
    "address": "433 California Ave, Palo Alto, CA",
    "cuisine": "Mediterranean",
    "signatureDish": "Falafel Plate",
    "sourceUrl": "https://mediterraneanwraps.com/menu"
  },
  "palo-alto-taro-san-japanese-noodle-bar": {
    "address": "717 Stanford Shopping Center, Palo Alto, CA",
    "cuisine": "Japanese",
    "signatureDish": "Niku Udon",
    "sourceUrl": "https://order.toasttab.com/online/tarosan"
  },
  "palo-alto-zaytinya": {
    "address": "180 El Camino Real Suite EE1400, Palo Alto, CA",
    "cuisine": "Mediterranean",
    "signatureDish": "Falafel",
    "sourceUrl": "https://order.toasttab.com/online/zaytinya-palo-alto"
  },
  "palo-alto-ramen-nagi": {
    "address": "541 Bryant St, Palo Alto, CA",
    "cuisine": "Japanese",
    "signatureDish": "Butao Ramen",
    "sourceUrl": "https://n-nagi.com/english/"
  },
  "mountain-view-olympus-caffe-bakery": {
    "address": "135 Castro Street, Mountain View, CA",
    "cuisine": "Greek",
    "signatureDish": "Gyro",
    "sourceUrl": "https://order.toasttab.com/online/olympus-caffe-bakery-135-castro-street"
  },
  "mountain-view-eureka": {
    "address": "191 Castro Street, Mountain View, CA",
    "cuisine": "American",
    "signatureDish": "Wings",
    "sourceUrl": "https://order.toasttab.com/online/eureka-mountain-view"
  },
  "mountain-view-cascal": {
    "address": "400 Castro Street, Mountain View, CA",
    "cuisine": "Latin",
    "signatureDish": "Paella",
    "sourceUrl": "https://order.toasttab.com/online/cascal-400-castro-street"
  },
  "mountain-view-sizzling-lunch": {
    "address": "1760 Miramonte Avenue, Mountain View, CA",
    "cuisine": "Japanese",
    "signatureDish": "Beef Pepper Rice",
    "sourceUrl": "https://order.toasttab.com/online/sizzlinglunch-mountain-view"
  },
  "mountain-view-los-amigos": {
    "address": "1040 Grant Rd #305, Mountain View, CA",
    "cuisine": "Mexican",
    "signatureDish": "Taqueria Style Taco",
    "sourceUrl": "https://order.toasttab.com/online/los-amigos-mountainview"
  },
  "mountain-view-casa-lupe": {
    "address": "459 Castro St, Mountain View, CA",
    "cuisine": "Mexican",
    "signatureDish": "Fajitas",
    "sourceUrl": "https://casalupemountainview.com/"
  },
  "mountain-view-doppio-zero": {
    "address": "160 Castro Street, Mountain View, CA",
    "cuisine": "Italian pizza",
    "signatureDish": "DoppioZero Pizza",
    "sourceUrl": "https://order.toasttab.com/online/doppio-zero-160-castro-street"
  },
  "mountain-view-blue-line-pizza": {
    "address": "146 Castro St, Mountain View, CA",
    "cuisine": "Pizza",
    "signatureDish": "Deep Dish Pizza",
    "sourceUrl": "https://order.toasttab.com/online/blue-line-pizza-mtn-view"
  },
  "mountain-view-la-fontaine-restaurant": {
    "address": "186 Castro Street, Mountain View, CA",
    "cuisine": "French and Italian",
    "signatureDish": "La Fontaine Pizza",
    "sourceUrl": "https://order.online/store/-46"
  },
  "mountain-view-zareen-s": {
    "address": "1477 Plymouth Street, Mountain View, CA",
    "cuisine": "Pakistani and Indian",
    "signatureDish": "Chicken Tikka Masala",
    "sourceUrl": "https://www.zareensrestaurant.com/locations",
    "menuUrl": "https://order.online/store/-538"
  },
  "santa-clara-puesto": {
    "address": "2752 Augustine Dr Ste 110, Santa Clara, CA",
    "cuisine": "Mexican",
    "signatureDish": "Filet Mignon Burrito",
    "sourceUrl": "https://order.toasttab.com/online/puesto-santa-clara-2752-augustine-dr-ste-110"
  },
  "santa-clara-eureka": {
    "address": "2762 Augustine Dr Suite 130, Santa Clara, CA",
    "cuisine": "American",
    "signatureDish": "Wings",
    "sourceUrl": "https://order.toasttab.com/online/eureka-santa-clara"
  },
  "santa-clara-mikayla-s-cafe": {
    "address": "2209 Tasman Dr, Santa Clara, CA",
    "cuisine": "American breakfast",
    "signatureDish": "Farmer's Fried Steak",
    "sourceUrl": "https://order.toasttab.com/online/mikaylas-cafe-2209-tasman-dr"
  },
  "santa-clara-greenfish-teriyaki-cafe": {
    "address": "1992 Lafayette Street, Santa Clara, CA",
    "cuisine": "Japanese",
    "signatureDish": "Chicken Teriyaki Bento",
    "sourceUrl": "https://order.toasttab.com/online/greenfish-teriyaki-cafe2-1992-lafayette-street"
  },
  "santa-clara-anjappar-chettinad-indian-restaurant": {
    "address": "777 Lawrence Expressway Suite 8, Santa Clara, CA",
    "cuisine": "South Indian",
    "signatureDish": "Chicken 65",
    "sourceUrl": "https://order.toasttab.com/online/anjappar-santa-clara-777-lawrence-expressway-suite-8"
  },
  "santa-clara-chicken-meets-rice": {
    "address": "2213 Tasman Dr, Santa Clara, CA",
    "cuisine": "Hainanese",
    "signatureDish": "Hainan Chicken Box",
    "sourceUrl": "https://order.toasttab.com/online/chicken-meets-rice-santa-clara-2213-tasman-dr"
  },
  "santa-clara-kailash-parbat": {
    "address": "3406 El Camino Real Unit 1, Santa Clara, CA",
    "cuisine": "Indian",
    "signatureDish": "Paneer Tikka Lababdar",
    "sourceUrl": "https://order.toasttab.com/online/kailash-parbart-santa-clara-3406-el-camino-real-suite-1"
  },
  "santa-clara-idly-express": {
    "address": "2006 El Camino Real, Santa Clara, CA",
    "cuisine": "South Indian",
    "signatureDish": "Thatte Idly",
    "sourceUrl": "https://order.toasttab.com/online/idly-express-santa-clara"
  },
  "santa-clara-stan-s-donut-shop": {
    "address": "2628 Homestead Rd, Santa Clara, CA",
    "cuisine": "Bakery",
    "signatureDish": "Glazed Donut",
    "sourceUrl": "https://www.stansdonutshop.com/menus"
  },
  "santa-clara-mapo-bbq": {
    "address": "3395 El Camino Real, Santa Clara, CA",
    "cuisine": "Korean barbecue",
    "signatureDish": "Tofu with Kimchi",
    "sourceUrl": "https://www.mapogui.com/"
  },
  "cupertino-eureka": {
    "address": "19369 Stevens Creek Blvd Suite 130, Cupertino, CA",
    "cuisine": "American",
    "signatureDish": "American burger",
    "sourceUrl": "https://order.toasttab.com/online/eureka-cupertino"
  },
  "cupertino-yayoi": {
    "address": "20682 Homestead Road, Cupertino, CA",
    "cuisine": "Japanese",
    "signatureDish": "Ton Katsu",
    "sourceUrl": "https://order.toasttab.com/online/yayoi-cupertino-new-20682-homestead-road"
  },
  "cupertino-sweet-maple": {
    "address": "20010 Stevens Creek Blvd, Cupertino, CA",
    "cuisine": "American breakfast",
    "signatureDish": "Big Hip",
    "sourceUrl": "https://order.toasttab.com/online/sweet-maple-cupertino-20010-steven-creek-blvd"
  },
  "cupertino-sizzling-lunch": {
    "address": "10033 Saich Way, Cupertino, CA",
    "cuisine": "Japanese",
    "signatureDish": "Garlic Beef Pepper Rice",
    "sourceUrl": "https://order.toasttab.com/online/sizzlinglunch-cupertino"
  },
  "cupertino-erthya": {
    "address": "10310 S De Anza Blvd, Cupertino, CA",
    "cuisine": "Indian",
    "signatureDish": "Bagara Baingan",
    "sourceUrl": "https://erthya.com/menu/"
  },
  "cupertino-safar-by-karimi": {
    "address": "19930 Stevens Creek Boulevard, Cupertino, CA",
    "cuisine": "Indian",
    "signatureDish": "Vegetable Parda Biryani",
    "sourceUrl": "https://www.safarbykarimi.com/online-ordering"
  },
  "cupertino-qq-noodle": {
    "address": "10889 S Blaney Ave, Cupertino, CA",
    "cuisine": "Chinese noodles",
    "signatureDish": "Special Hot Oil Noodles",
    "sourceUrl": "https://dinfo.me/qqnoodle/index.php/welcome/menu"
  },
  "cupertino-mian-sichuan-noodles-and-dumplings": {
    "address": "19389 Stevens Creek Boulevard, Cupertino, CA",
    "cuisine": "Sichuan",
    "signatureDish": "Chengdu Zajiang Noodles",
    "sourceUrl": "https://order.toasttab.com/online/mian-san-mateo-inc-3540-homestead-rd"
  },
  "cupertino-ippudo": {
    "address": "19540 Vallco Parkway Suite 130, Cupertino, CA",
    "cuisine": "Japanese ramen",
    "signatureDish": "Shiromaru Classic",
    "sourceUrl": "https://www.ippudous.com/cupertino"
  },
  "cupertino-kabab-currys": {
    "address": "20007 Stevens Creek Blvd, Cupertino, CA",
    "cuisine": "Indian",
    "signatureDish": "Choley Bhaturey",
    "sourceUrl": "https://www.kababandcurrys.com/menu/Cupertino"
  },
  "san-jose-fitoor": {
    "address": "377 Santana Row #1140, San Jose, CA",
    "cuisine": "Indian",
    "signatureDish": "Malabar paratha quesadilla",
    "sourceUrl": "https://order.toasttab.com/online/fitoor-377-santana-row"
  },
  "san-jose-tomato-thyme": {
    "address": "1560 Hamilton Avenue, San Jose, CA",
    "cuisine": "Italian",
    "signatureDish": "Spaghetti with Marinara",
    "sourceUrl": "https://order.toasttab.com/online/tomato-thyme"
  },
  "san-jose-copita": {
    "address": "1098 Lincoln Avenue, San Jose, CA",
    "cuisine": "Mexican",
    "signatureDish": "Carne Asada",
    "sourceUrl": "https://order.toasttab.com/online/copita-willow-glen"
  },
  "san-jose-john-s-of-willow-glen": {
    "address": "1238 Lincoln Ave, San Jose, CA",
    "cuisine": "Greek and American",
    "signatureDish": "Dolmades",
    "sourceUrl": "https://order.toasttab.com/online/johns-of-willow-glen"
  },
  "san-jose-spread": {
    "address": "170 Jackson Street, San Jose, CA",
    "cuisine": "Sandwiches",
    "signatureDish": "Triple Threat",
    "sourceUrl": "https://order.toasttab.com/online/spread-san-jose-new-170-jackson-street"
  },
  "san-jose-khaosan-thai": {
    "address": "2062 Curtner Avenue, San Jose, CA",
    "cuisine": "Thai",
    "signatureDish": "Pad Thai",
    "sourceUrl": "https://order.toasttab.com/online/khaosan-thai-2062-curtner-avenue"
  },
  "san-jose-la-victoria-taqueria": {
    "address": "140 E San Carlos St, San Jose, CA",
    "cuisine": "Mexican",
    "signatureDish": "Super Burrito and Orange Sauce",
    "sourceUrl": "https://la-victoria-taqueria.order.online/en/store/la-victoria-taqueria-san-jose-190"
  },
  "san-jose-peters-bakery": {
    "address": "3108 Alum Rock Ave, San Jose, CA",
    "cuisine": "Bakery",
    "signatureDish": "Burnt Almond Cake",
    "sourceUrl": "https://order.toasttab.com/online/petersbakery"
  },
  "san-jose-garden-s-gate-cafe": {
    "address": "1530 Southwest Expressway Unit 10, San Jose, CA",
    "cuisine": "Cafe",
    "signatureDish": "Chicken Avocado Sandwich",
    "sourceUrl": "https://order.toasttab.com/online/gardens-gate-cafe-san-jose-1530-southwest-expressway-unit-10"
  },
  "san-jose-el-jardin": {
    "address": "368 Santana Row, San Jose, CA",
    "cuisine": "Mexican",
    "signatureDish": "Taco de Carnitas",
    "sourceUrl": "https://order.toasttab.com/online/el-jardin"
  },
  "hayward-pupuseria-las-cabanas": {
    "address": "30030 Mission Blvd, Hayward, CA",
    "cuisine": "Salvadoran",
    "signatureDish": "Pupusas de Maiz",
    "sourceUrl": "https://order.toasttab.com/online/pupuseria-las-cabanas-30030-mission-blvd"
  },
  "hayward-khao-hom": {
    "address": "22545 Foothill Blvd, Hayward, CA",
    "cuisine": "Thai",
    "signatureDish": "Pad Thai",
    "sourceUrl": "https://www.khaohomca.com/"
  },
  "hayward-a-romo-s-cafe": {
    "address": "296 A St, Hayward, CA",
    "cuisine": "Cafe",
    "signatureDish": "Kahlo Croissant",
    "sourceUrl": "https://order.toasttab.com/online/aromoscafe"
  },
  "hayward-la-ca-bakery-cafe": {
    "address": "24788 Amador St, Hayward, CA",
    "cuisine": "Vietnamese bakery",
    "signatureDish": "Grilled Chicken Banh Mi",
    "sourceUrl": "https://order.toasttab.com/online/la-ca-bakery-cafe-24788-amador-st"
  },
  "hayward-metro-taquero": {
    "address": "29950 Huntwood Avenue, Hayward, CA",
    "cuisine": "Mexican",
    "signatureDish": "Haystack Burrito",
    "sourceUrl": "https://order.toasttab.com/online/metro-taquero-huntwood"
  },
  "hayward-sana-a-cafe": {
    "address": "20885 Mission Boulevard, Hayward, CA",
    "cuisine": "Yemeni cafe",
    "signatureDish": "Pistachio Rose Croissant",
    "sourceUrl": "https://order.toasttab.com/online/sana-a-cafe-hayward-20885-mission-boulevard"
  },
  "hayward-tacos-el-gordo": {
    "address": "792 B St, Hayward, CA",
    "cuisine": "Mexican",
    "signatureDish": "Taco de Asada",
    "sourceUrl": "https://www.tacoselgordo.com/menu-hayward"
  },
  "hayward-acqua-e-farina": {
    "address": "22622 Main St, Hayward, CA",
    "cuisine": "Italian",
    "signatureDish": "Combo Pizza",
    "sourceUrl": "https://order.toasttab.com/online/acqua-e-farina-22622-main-st"
  },
  "hayward-rockit-char-grill": {
    "address": "1057 B St, Hayward, CA",
    "cuisine": "American burgers",
    "signatureDish": "Belly Burger",
    "sourceUrl": "https://order.toasttab.com/online/rockit-char-grill"
  },
  "hayward-buffalo-bill-s-brewery": {
    "address": "1082 B Street, Hayward, CA",
    "cuisine": "American",
    "signatureDish": "Buffalo Bill's Burger",
    "sourceUrl": "https://order.toasttab.com/online/buffalo-bills-cerveceria"
  },
  "fremont-fremont-food-hall": {
    "address": "3768 Capitol Avenue #A, Fremont, CA",
    "cuisine": "Japanese",
    "signatureDish": "Chicken Katsu Plate",
    "sourceUrl": "https://order.toasttab.com/online/fremont-food-court-3768-capitol-avenue-a"
  },
  "fremont-honest-indian-vegetarian-restaurant": {
    "address": "3658 Capitol Avenue, Fremont, CA",
    "cuisine": "Indian vegetarian",
    "signatureDish": "Bhaji Pav",
    "sourceUrl": "https://order.toasttab.com/online/honest-kitchen-fremont-3658-capitol-avenue"
  },
  "fremont-home-eat": {
    "address": "46573 Mission Blvd, Fremont, CA",
    "cuisine": "Chinese",
    "signatureDish": "Spicy Beef Noodle Soup",
    "sourceUrl": "https://order.toasttab.com/online/home-eat-fremont"
  },
  "fremont-shalimar-restaurant": {
    "address": "3325 Walnut Ave, Fremont, CA",
    "cuisine": "Pakistani and Indian",
    "signatureDish": "Chicken Tikka Masala",
    "sourceUrl": "https://order.online/store/shalimar-42463/"
  },
  "fremont-bongo-s": {
    "address": "39407 Fremont Blvd, Fremont, CA",
    "cuisine": "Bengali",
    "signatureDish": "Goat Biriyani",
    "sourceUrl": "https://order.toasttab.com/online/bongos"
  },
  "fremont-skillet-z-cafe": {
    "address": "37378 Niles Blvd, Fremont, CA",
    "cuisine": "American breakfast",
    "signatureDish": "Skillet'z Special",
    "sourceUrl": "https://order.toasttab.com/online/skilletz-cafe"
  },
  "fremont-cafe-mei": {
    "address": "43761 Boscell Road #5125, Fremont, CA",
    "cuisine": "Taiwanese cafe",
    "signatureDish": "Radish Cake",
    "sourceUrl": "https://order.toasttab.com/online/cafe-mei-em-43761-boscell-road"
  },
  "fremont-cay-cafe": {
    "address": "46551 Mission Blvd Unit 104, Fremont, CA",
    "cuisine": "Vietnamese",
    "signatureDish": "Grilled Chicken Banh Mi",
    "sourceUrl": "https://order.toasttab.com/online/cay-cafe"
  },
  "fremont-bill-s-cafe": {
    "address": "39222 Fremont Blvd, Fremont, CA",
    "cuisine": "American breakfast",
    "signatureDish": "California Omelette",
    "sourceUrl": "https://order.toasttab.com/online/bills-cafe-fremont-39222-fremont-blvd"
  },
  "fremont-de-afghanan-cuisine": {
    "address": "37395 Fremont Blvd, Fremont, CA",
    "cuisine": "Afghan",
    "signatureDish": "Teka Kabob",
    "sourceUrl": "https://deafghanancuisine.telwink.com/menu.html"
  },
  "sfo-bun-mee": {
    "address": "Harvey Milk Terminal 1, near Gate B3, San Francisco International Airport",
    "cuisine": "Vietnamese",
    "signatureDish": "Bánh mì",
    "sourceUrl": "https://www.flysfo.com/passengers/shop-dine-relax/bun-mee"
  }
};
