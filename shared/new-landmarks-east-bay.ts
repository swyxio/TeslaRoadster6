import type { NorthLandmarkShape } from './north-landmarks';

/** Real inspirations and deliberately approximate desired positions. The caller
 * resolves clear supported footprints; no road, building or coastline is implied.
 * Richmond and Alameda are compressed onto existing East Bay land. */
export const specs = [
  // Berkeley's hills and campus: several destinations cluster in the small city grid.
  {id:'new-berkeley-bampfa',name:'Berkeley Art Museum and Pacific Film Archive',area:'Berkeley',shape:'modern',h:18,x:475,z:-235,source:'https://visit.berkeley.edu/campus-attractions'},
  {id:'new-lawrence-hall',name:'Lawrence Hall of Science',area:'Berkeley',shape:'modern',h:16,x:575,z:-225,source:'https://lawrencehallofscience.org/visitors/directions-parking/'},
  {id:'new-uc-botanical-garden',name:'UC Botanical Garden at Berkeley',area:'Berkeley',shape:'greenhouse',h:13,x:570,z:-245,source:'https://botanicalgarden.berkeley.edu/visit/plan-your-visit/'},
  {id:'new-california-memorial-stadium',name:'California Memorial Stadium',area:'Berkeley',shape:'stadium',h:18,x:565,z:-200,source:'https://visit.berkeley.edu/campus-attractions'},
  {id:'new-south-hall',name:'South Hall',area:'Berkeley',shape:'cliff',h:18,x:515,z:-240,source:'https://www.berkeley.edu/about/history-discoveries/'},
  {id:'new-hearst-mining',name:'Hearst Memorial Mining Building',area:'Berkeley',shape:'library',h:17,x:530,z:-225,source:'https://www.berkeley.edu/map/hearst-memorial-mining-building/'},
  {id:'new-berkeley-city-club',name:'Berkeley City Club',area:'Berkeley',shape:'castle',h:22,x:455,z:-180,source:'https://www.berkeleycityclub.com/our-history'},
  {id:'new-berkeley-rose-garden',name:'Berkeley Rose Garden',area:'Berkeley',shape:'greek',h:10,x:550,z:-260,source:'https://berkeleyca.gov/community-recreation/parks-recreation/parks/berkeley-rose-garden-park'},
  {id:'new-tilden-merry-go-round',name:'Tilden Park Merry-Go-Round',area:'Berkeley',shape:'rotunda',h:12,x:555,z:-240,source:'https://www.ebparks.org/parks/tilden'},
  {id:'new-tilden-steam-trains',name:'Tilden Park Steam Trains',area:'Berkeley',shape:'pier',h:11,x:580,z:-210,source:'https://www.ebparks.org/parks/tilden'},

  // Oakland's stadium complex, neighbourhood institutions and historic houses.
  {id:'new-oakland-coliseum',name:'Oakland Coliseum',area:'Oakland',shape:'stadium',h:21,x:710,z:650,source:'https://www.theoaklandarena.com/about-oakland'},
  {id:'new-oakland-arena',name:'Oakland Arena',area:'Oakland',shape:'stadium',h:19,x:745,z:680,source:'https://www.theoaklandarena.com/about-oakland'},
  {id:'new-sixteenth-street-station',name:'16th Street Station',area:'Oakland',shape:'library',h:17,x:335,z:20,source:'https://www.oaklandca.gov/Planning-Building/Historic-Preservation/Historical-and-Architectural-Rating-Systems'},
  {id:'new-camron-stanford',name:'Camron-Stanford House',area:'Oakland',shape:'barracks',h:15,x:505,z:115,source:'https://www.visitoakland.com/listing/camron-stanford-house/509/'},
  {id:'new-dunsmuir-hellman',name:'Dunsmuir Hellman Historic Estate',area:'Oakland',shape:'library',h:18,x:940,z:1180,source:'https://www.oaklandca.gov/Community/Parks-Facilities/Rent-a-Facility-or-Park/Dunsmuir-Hellman-Historic-Estate'},
  {id:'new-peralta-hacienda',name:'Peralta Hacienda Historical Park',area:'Oakland',shape:'barracks',h:15,x:740,z:820,source:'https://www.visitoakland.com/listing/peralta-hacienda-historical-park/461/'},
  {id:'new-oakland-aviation-museum',name:'Oakland Aviation Museum',area:'Oakland',shape:'museum',h:14,x:780,z:1140,source:'https://www.oaklandaviationmuseum.org/oam-mission-and-history'},
  {id:'new-morcom-rose-garden',name:'Morcom Rose Garden',area:'Oakland',shape:'greek',h:10,x:580,z:135,source:'https://www.oaklandca.gov/Community/Parks-Facilities/Rent-a-Facility-or-Park/Morcom-Rose-Garden'},
  {id:'new-aamlo',name:'African American Museum and Library at Oakland',area:'Oakland',shape:'library',h:18,x:385,z:-65,source:'https://oaklandlibrary.org/locations/aaa/'},

  // The unsupported real Alameda island is playfully compressed to the East Bay shore.
  {id:'new-uss-hornet',name:'USS Hornet Museum',area:'Alameda',shape:'maritime',h:19,x:340,z:285,source:'https://www.alamedaca.gov/RESIDENTS/Visit-Alameda/Attractions'},
  {id:'new-alameda-theatre',name:'Alameda Theatre',area:'Alameda',shape:'theatre',h:18,x:395,z:335,source:'https://www.alamedaca.gov/files/assets/public/v/3/departments/alameda/building-planning-transportation/historic-preservation/historic-monuments-list.pdf'},
  {id:'new-alameda-st-joseph',name:'St. Joseph Basilica',area:'Alameda',shape:'mission',h:20,x:435,z:390,source:'https://www.alamedaca.gov/files/assets/public/v/3/departments/alameda/building-planning-transportation/historic-preservation/historic-monuments-list.pdf'},

  // Richmond's real waterfront lies north of the current Oakland/Berkeley polygon.
  {id:'new-richmond-ford-assembly',name:'Ford Assembly Building',area:'Richmond',shape:'fort',h:16,x:380,z:-250,source:'https://www.nps.gov/rori/planyourvisit/directions.htm'},
  {id:'new-rosie-memorial',name:'Rosie the Riveter Memorial',area:'Richmond',shape:'organ',h:17,x:420,z:-260,source:'https://www.nps.gov/rori/planyourvisit/placestogo.htm'},

  {id:'new-casa-peralta',name:'Casa Peralta',area:'San Leandro',shape:'barracks',h:15,x:1030,z:1750,source:'https://www.sanleandro.org/537/Casa-Peralta'},
  {id:'new-meek-mansion',name:'Meek Mansion',area:'Hayward',shape:'barracks',h:17,x:1120,z:2300,source:'https://www.haywardareahistory.org/meek-mansion'},
  {id:'new-hayward-japanese-gardens',name:'Hayward Japanese Gardens',area:'Hayward',shape:'tea',h:12,x:1200,z:2700,source:'https://www.haywardrec.org/Facilities/Facility/Details/100'},
  {id:'new-mcconaghy-house',name:'McConaghy House',area:'Hayward',shape:'cliff',h:16,x:1300,z:3100,source:'https://www.haywardrec.org/facilities/facility/details/McConaghy-House-126'},
  {id:'new-hayward-shoreline-center',name:'Hayward Shoreline Interpretive Center',area:'Hayward',shape:'pier',h:12,x:1250,z:3650,source:'https://haywardrec.org/1991/Nature-Centers'},
  {id:'new-coyote-hills',name:'Coyote Hills Visitor Center',area:'Fremont',shape:'barracks',h:13,x:1400,z:4700,source:'https://www.ebparks.org/parks/visitor-centers/coyote-hills'},
  {id:'new-don-edwards-visitor',name:'Don Edwards San Francisco Bay National Wildlife Refuge',area:'Fremont',shape:'barracks',h:13,x:1460,z:5100,source:'https://www.fws.gov/refuge/don-edwards-san-francisco-bay'},
  {id:'new-sunol-depot',name:'Sunol Depot',area:'Sunol',shape:'pier',h:13,x:1680,z:5700,source:'https://www.ncry.org/about/'},
  {id:'new-fremont-central-pavilion',name:'Central Park Performance Pavilion',area:'Fremont',shape:'rotunda',h:14,x:1690,z:6500,source:'https://www.fremont.gov/government/departments/parks-recreation/events/summer-concert-series'},
] as const satisfies readonly {id:string;name:string;area:string;shape:NorthLandmarkShape;h:number;x:number;z:number;source:string}[];
