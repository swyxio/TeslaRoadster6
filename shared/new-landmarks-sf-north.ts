import type { NorthLandmarkShape } from './north-landmarks';

/**
 * Additional real-world inspirations, researched 2026-10-18. Anchors are
 * approximate intentions in the compressed game, not navigation coordinates.
 * The consumer must resolve footprints against supported ground, roads and
 * gameplay objects. The existing shape is a starting silhouette, not a survey.
 */
type NewNorthSpec = {
  id:string; name:string; area:'sf'|'marin'; shape:NorthLandmarkShape;
  h:number; x:number; z:number; source:string;
};

export const SF_NORTH_SPECS = [
  {id:'fort-mason',name:'Fort Mason',area:'sf',shape:'barracks',h:13,x:-160,z:-255,source:'https://www.nps.gov/places/fort-mason-historic-district.htm'},
  {id:'presidio-officers-club',name:'Presidio Officers’ Club',area:'sf',shape:'mission',h:12,x:-260,z:-260,source:'https://www.nps.gov/places/000/presidio-officers-club.htm'},
  {id:'disney-family-museum',name:'The Walt Disney Family Museum',area:'sf',shape:'museum',h:14,x:-250,z:-245,source:'https://www.waltdisney.org/visit'},
  {id:'presidio-tunnel-tops',name:'Presidio Tunnel Tops',area:'sf',shape:'battery',h:10,x:-290,z:-255,source:'https://home.nps.gov/places/000/presidio-tunnel-tops.htm'},
  {id:'letterman-digital-arts',name:'Letterman Digital Arts Center',area:'sf',shape:'barracks',h:14,x:-210,z:-260,source:'https://presidio.gov/explore/attractions/one-letterman'},
  {id:'hyde-street-pier',name:'Hyde Street Pier',area:'sf',shape:'pier',h:11,x:-110,z:-235,source:'https://www.nps.gov/safr/learn/historyculture/hyde-street-pier.htm'},
  {id:'city-lights',name:'City Lights Bookstore',area:'sf',shape:'plaza',h:12,x:-35,z:-170,source:'https://citylights.com/bookstore/'},
  {id:'columbus-tower',name:'Columbus Tower',area:'sf',shape:'modern',h:23,x:-20,z:-160,source:'https://sfplanning.s3.amazonaws.com/commissions/cpcpackets/2019-019722CUA.pdf'},
  {id:'fairmont-sf',name:'Fairmont San Francisco',area:'sf',shape:'library',h:22,x:-75,z:-120,source:'https://www.fairmont.com/en/hotels/san-francisco/fairmont-san-francisco.html'},
  {id:'flood-building',name:'Flood Building',area:'sf',shape:'modern',h:24,x:-50,z:-55,source:'https://www.floodbuilding.com/history.html'},
  {id:'hallidie-building',name:'Hallidie Building',area:'sf',shape:'modern',h:22,x:-30,z:-65,source:'https://default.sfplanning.org/meetingarchive/planning_dept/commissions.sfplanning.org/hpcpackets/2011.0613A.pdf'},
  {id:'audiffred-building',name:'Audiffred Building',area:'sf',shape:'plaza',h:14,x:50,z:-45,source:'https://sfplanninggis.org/docs/landmarks_and_districts/LM7.pdf'},
  {id:'sf-old-mint',name:'San Francisco Old Mint',area:'sf',shape:'library',h:16,x:-45,z:5,source:'https://www.usmint.gov/about/tours-and-locations/san-francisco'},
  {id:'palace-hotel',name:'Palace Hotel',area:'sf',shape:'modern',h:23,x:5,z:-25,source:'https://www.sfpalace.com/history/'},
  {id:'salesforce-transit-center',name:'Salesforce Transit Center',area:'sf',shape:'academy',h:12,x:25,z:15,source:'https://www.sfcta.org/projects/salesforce-transit-center'},
  {id:'dewey-monument',name:'Dewey Monument',area:'sf',shape:'lighthouse',h:20,x:-50,z:-80,source:'https://sfrecpark.org/DocumentCenter/View/20083/Union-Square-RFP-Final-2023'},
  {id:'sf-armory',name:'San Francisco Armory',area:'sf',shape:'castle',h:20,x:-170,z:115,source:'https://npgallery.nps.gov/GetAsset/5e4541e8-9027-4560-a787-f9b83dfd3b1d'},
  {id:'sf-columbarium',name:'San Francisco Columbarium',area:'sf',shape:'rotunda',h:20,x:-330,z:-70,source:'https://default.sfplanning.org/meetingarchive/planning_dept/sf-planning.org/ftp/files/Commission/HPCPackets/2009.0457ACE.pdf'},
  {id:'kezar-stadium',name:'Kezar Stadium',area:'sf',shape:'stadium',h:12,x:-330,z:70,source:'https://sfrecpark.org/830/Kezar-Stadium'},
  {id:'golden-gate-bandshell',name:'Golden Gate Bandshell',area:'sf',shape:'opera',h:15,x:-305,z:45,source:'https://www.sfrecpark.org/1570/Golden-Gate-Bandshell-Concerts'},
  {id:'dutch-windmill',name:'Dutch Windmill',area:'sf',shape:'lighthouse',h:22,x:-375,z:40,source:'https://www.sfrecpark.org/1116/Golden-Gate-Park-Points-of-Interest'},
  {id:'sf-main-library',name:'San Francisco Main Library',area:'sf',shape:'library',h:17,x:-135,z:0,source:'https://sfpl.org/locations/main-library/about/architecture-main-library'},
  {id:'saint-ignatius',name:'Saint Ignatius Church',area:'sf',shape:'church',h:24,x:-300,z:-40,source:'https://www.usfca.edu/news/nine-suprising-facts-saint-ignatius-church'},
  {id:'childrens-creativity',name:'Children’s Creativity Museum',area:'sf',shape:'museum',h:12,x:15,z:80,source:'https://creativity.org/'},
  {id:'contemporary-jewish',name:'The Contemporary Jewish Museum',area:'sf',shape:'crystal',h:18,x:-5,z:40,source:'https://thecjm.org/'},
  {id:'moad',name:'Museum of the African Diaspora',area:'sf',shape:'modern',h:16,x:20,z:40,source:'https://www.moadsf.org/visit'},
  {id:'sf-craft-design',name:'Museum of Craft and Design',area:'sf',shape:'museum',h:12,x:-120,z:205,source:'https://sfmcd.org/'},
  {id:'glbt-history-museum',name:'GLBT Historical Society Museum',area:'sf',shape:'plaza',h:12,x:-300,z:70,source:'https://www.glbthistory.org/museum-about-visitor-info'},
  {id:'haas-lilienthal',name:'Haas-Lilienthal House',area:'sf',shape:'houses',h:17,x:-165,z:-110,source:'https://www.haas-lilienthalhouse.org/'},
  {id:'muir-woods',name:'Muir Woods National Monument',area:'marin',shape:'gate',h:12,x:-360,z:-475,source:'https://www.nps.gov/muwo/learn/nature/index.htm'},
  {id:'marin-civic-center',name:'Marin County Civic Center',area:'marin',shape:'civic',h:20,x:-200,z:-530,source:'https://www.marincounty.gov/departments/cultural-services/frank-lloyd-wright/history-frank-lloyd-wright-marin'},
  {id:'bay-model',name:'Bay Model Visitor Center',area:'marin',shape:'museum',h:12,x:-145,z:-490,source:'https://www.spn.usace.army.mil/Missions/Recreation/Bay-Model-Visitor-Center/California/'},
  {id:'mission-san-rafael',name:'Mission San Rafael Arcángel',area:'marin',shape:'mission',h:15,x:-165,z:-535,source:'https://www.parks.ca.gov/ListedResources/Detail/220'},
  {id:'china-camp',name:'China Camp Village',area:'marin',shape:'pier',h:12,x:-130,z:-530,source:'https://www.parks.ca.gov/ListedResources/Detail/924'},
] as const satisfies readonly NewNorthSpec[];
