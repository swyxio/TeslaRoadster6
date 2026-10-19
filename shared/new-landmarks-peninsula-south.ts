/** Additional real-world inspirations in fictional, compressed game-space.
 * Anchors are approximate and require shared collision and terrain clearance. */
import type { NorthLandmarkShape } from './north-landmarks';

type Spec = {
  id:string; name:string; area:'peninsula'|'south-bay'; shape:NorthLandmarkShape;
  h:number; x:number; z:number; source:string;
};

export const specs:readonly Spec[] = [
  {id:'sanchez-adobe',name:'Sánchez Adobe',area:'peninsula',shape:'barracks',h:13,x:-670,z:850,source:'https://www.smcgov.org/parks/sanchez-adobe'},
  {id:'pigeon-point',name:'Pigeon Point Lighthouse',area:'peninsula',shape:'lighthouse',h:25,x:-1430,z:2100,source:'https://www.parks.ca.gov/?page_id=533'},
  {id:'woodside-store',name:'Woodside Store',area:'peninsula',shape:'barracks',h:12,x:-1150,z:2600,source:'https://www.smcgov.org/parks/woodside-store'},
  {id:'lucy-evans-baylands',name:'Lucy Evans Baylands Nature Interpretive Center',area:'peninsula',shape:'pier',h:12,x:-590,z:3800,source:'https://www.paloalto.gov/Departments/Community-Services/Facility-Rentals/Nature-Interpretive-Centers/Baylands-Nature-Interpretive-Center'},
  {id:'slac-accelerator',name:'SLAC National Accelerator Laboratory',area:'peninsula',shape:'modern',h:17,x:-1030,z:3800,source:'https://www6.slac.stanford.edu/about/our-story/history'},
  {id:'stanford-theatre',name:'Stanford Theatre',area:'peninsula',shape:'theatre',h:18,x:-770,z:3900,source:'https://stanfordtheatre.org/'},
  {id:'palo-alto-junior-museum',name:'Palo Alto Junior Museum & Zoo',area:'peninsula',shape:'museum',h:15,x:-650,z:4120,source:'https://www.paloaltozoo.org/Home'},
  {id:'sunnyvale-heritage',name:'Sunnyvale Heritage Park Museum',area:'south-bay',shape:'barracks',h:14,x:-80,z:6280,source:'https://heritageparkmuseum.org/home/the-museum'},
  {id:'great-america',name:"California's Great America",area:'south-bay',shape:'radio',h:26,x:120,z:6520,source:'https://www.sixflags.com/cagreatamerica/attractions/drop-tower'},
  {id:'intel-museum',name:'Intel Museum',area:'south-bay',shape:'modern',h:18,x:180,z:6650,source:'https://www.intel.com/content/www/us/en/support/articles/000089211/programs/intel-corporation.html'},
  {id:'our-lady-of-peace',name:'Our Lady of Peace Shrine',area:'south-bay',shape:'temple',h:23,x:220,z:6800,source:'https://www.santaclaraca.gov/Home/Components/ServiceDirectory/ServiceDirectory/1257/2661'},
  {id:'mission-santa-clara',name:'Mission Santa Clara de Asís',area:'south-bay',shape:'mission',h:22,x:70,z:6900,source:'https://www.scu.edu/missionchurch/history-of-the-mission/'},
  {id:'de-saisset',name:'de Saisset Museum',area:'south-bay',shape:'museum',h:16,x:130,z:6950,source:'https://www.scu.edu/desaisset/about/'},
  {id:'triton-art',name:'Triton Museum of Art',area:'south-bay',shape:'museum',h:17,x:210,z:7040,source:'https://www.tritonmuseum.org/visit'},
  {id:'harris-lass',name:'Harris-Lass Historic Preserve',area:'south-bay',shape:'houses',h:14,x:255,z:7150,source:'https://www.santaclaraca.gov/Home/Components/ServiceDirectory/ServiceDirectory/120/2674'},
  {id:'de-anza-planetarium',name:'Fujitsu Planetarium',area:'south-bay',shape:'crystal',h:16,x:0,z:7150,source:'https://daweb2.deanza.edu/events/month.html?m=04&y=2026'},
  {id:'ainsley-house',name:'Ainsley House',area:'south-bay',shape:'cliff',h:16,x:480,z:7950,source:'https://www.campbellca.gov/Facilities/Facility/Details/Ainsley-House-38'},
  {id:'hakone-gardens',name:'Hakone Estate and Gardens',area:'south-bay',shape:'tea',h:14,x:150,z:7300,source:'https://www.saratoga.ca.us/313/Hakone-Gardens'},
  {id:'montalvo-arts',name:'Montalvo Arts Center',area:'south-bay',shape:'cliff',h:17,x:230,z:7420,source:'https://www.saratoga.ca.us/BusinessDirectoryII.aspx?BID=24'},
  {id:'forbes-mill',name:'Forbes Mill Annex',area:'south-bay',shape:'fort',h:15,x:500,z:8100,source:'https://www.losgatosca.gov/1999/Historic-Districts'},
  {id:'lick-observatory',name:'Lick Observatory',area:'south-bay',shape:'rotunda',h:23,x:2110,z:8100,source:'https://nona.ucolick.org/mainb/'},
  {id:'san-jose-airport',name:'San José Mineta International Airport',area:'south-bay',shape:'modern',h:22,x:650,z:7700,source:'https://www.flysanjose.com/'},
  {id:'paypal-park',name:'PayPal Park',area:'south-bay',shape:'stadium',h:19,x:740,z:7900,source:'https://www.sjearthquakes.com/paypalpark/'},
  {id:'mcenery-center',name:'San Jose McEnery Convention Center',area:'south-bay',shape:'modern',h:19,x:1420,z:8550,source:'https://www.sanjose.org/meet/conventioncenter'},
  {id:'electric-light-tower',name:'History Park Electric Light Tower',area:'south-bay',shape:'radio',h:27,x:1740,z:8540,source:'https://historysanjose.org/plan-your-visit/history-park/electric-light-tower/'},
  {id:'quilts-textiles',name:'San Jose Museum of Quilts & Textiles',area:'south-bay',shape:'museum',h:15,x:1480,z:8500,source:'https://sj-mqt.org/visit-us'},
  {id:'japanese-american-museum',name:'Japanese American Museum of San Jose',area:'south-bay',shape:'museum',h:16,x:1500,z:8300,source:'https://www.sanjose.org/listings/japanese-american-museum-san-jose'},
  {id:'mexican-heritage-plaza',name:'Mexican Heritage Plaza',area:'south-bay',shape:'plaza',h:15,x:1800,z:8200,source:'https://www.sanjoseca.gov/home/showpublisheddocument/32461/636716850732700000'},
  {id:'santana-row',name:'Santana Row',area:'south-bay',shape:'plaza',h:18,x:610,z:8060,source:'https://www.sanjose.org/listings/santana-row'},
  {id:'emma-prusch',name:'Emma Prusch Farm Park',area:'south-bay',shape:'barracks',h:14,x:1850,z:8070,source:'https://www.sanjoseca.gov/Home/Components/FacilityDirectory/FacilityDirectory/2180/2028'},
  {id:'san-jose-gurdwara',name:'Sikh Gurdwara Sahib San Jose',area:'south-bay',shape:'civic',h:23,x:1990,z:7900,source:'https://sanjosegurdwara.org/about.html'},
  {id:'new-almaden',name:'New Almaden',area:'south-bay',shape:'barracks',h:15,x:820,z:8650,source:'https://www.nps.gov/places/new-almaden.htm'},
  {id:'excite-ballpark',name:'Excite Ballpark',area:'south-bay',shape:'stadium',h:19,x:1660,z:8420,source:'https://www.sanjose.org/listings/excite-ballpark'},
];
