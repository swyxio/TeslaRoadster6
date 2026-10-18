/** Recognizable northern Bay places. Coordinates are compressed game-space inventions. */
export type NorthLandmarkShape =
  | 'fort' | 'rotunda' | 'organ' | 'plaza' | 'pier' | 'maritime' | 'crooked'
  | 'church' | 'gate' | 'cathedral' | 'museum' | 'pagoda' | 'houses' | 'civic'
  | 'opera' | 'theatre' | 'academy' | 'deyoung' | 'greenhouse' | 'tea'
  | 'radio' | 'cliff' | 'baths' | 'stadium' | 'modern' | 'mission'
  | 'lighthouse' | 'battery' | 'barracks' | 'missile' | 'crystal' | 'castle'
  | 'temple' | 'greek' | 'library';
export type NorthLandmark = {
  id:string; name:string; x:number; z:number; w:number; d:number; h:number;
  district:'sf'|'oakland'; shape:NorthLandmarkShape;
};
// All collision envelopes are deliberately small, on flat supported ground,
// and clear of streets and gameplay markers. Names identify the real inspiration;
// neither geometry nor location is an exact replica.
export const NORTH_LANDMARKS: readonly NorthLandmark[] = [
 {id:'fort-point',name:'Fort Point',x:-270,z:-275,w:16,d:14,h:11,district:'sf',shape:'fort'},
 {id:'palace-fine-arts',name:'Palace of Fine Arts',x:-210,z:-275,w:16,d:16,h:19,district:'sf',shape:'rotunda'},
 {id:'wave-organ',name:'Wave Organ',x:-150,z:-275,w:14,d:14,h:9,district:'sf',shape:'organ'},
 {id:'lombard',name:'Lombard Street',x:-330,z:-275,w:16,d:16,h:8,district:'sf',shape:'crooked'},
 {id:'cliff-house',name:'Cliff House',x:-330,z:-210,w:16,d:14,h:12,district:'sf',shape:'cliff'},
 {id:'legion-honor',name:'Legion of Honor',x:-270,z:-210,w:16,d:14,h:14,district:'sf',shape:'library'},
 {id:'maritime-museum',name:'Maritime Museum',x:-210,z:-210,w:16,d:14,h:12,district:'sf',shape:'maritime'},
 {id:'ghirardelli',name:'Ghirardelli Square',x:-150,z:-210,w:16,d:14,h:19,district:'sf',shape:'plaza'},
 {id:'pier-39',name:'Pier 39',x:-90,z:-210,w:16,d:14,h:13,district:'sf',shape:'pier'},
 {id:'sutro-baths',name:'Sutro Baths',x:-330,z:-150,w:16,d:16,h:7,district:'sf',shape:'baths'},
 {id:'conservatory-flowers',name:'Conservatory of Flowers',x:-270,z:-150,w:16,d:14,h:12,district:'sf',shape:'greenhouse'},
 {id:'japanese-tea-garden',name:'Japanese Tea Garden',x:-210,z:-150,w:16,d:14,h:13,district:'sf',shape:'tea'},
 {id:'peace-pagoda',name:'Japantown Peace Pagoda',x:-150,z:-150,w:14,d:14,h:24,district:'sf',shape:'pagoda'},
 {id:'grace-cathedral',name:'Grace Cathedral',x:-90,z:-150,w:16,d:14,h:22,district:'sf',shape:'cathedral'},
 {id:'saints-peter-paul',name:'Saints Peter and Paul Church',x:-30,z:-150,w:16,d:14,h:24,district:'sf',shape:'church'},
 {id:'exploratorium',name:'Exploratorium',x:30,z:-150,w:16,d:14,h:10,district:'sf',shape:'museum'},
 {id:'california-academy',name:'California Academy of Sciences',x:-330,z:-90,w:16,d:14,h:11,district:'sf',shape:'academy'},
 {id:'de-young',name:'de Young Museum',x:-270,z:-90,w:16,d:14,h:21,district:'sf',shape:'deyoung'},
 {id:'painted-ladies',name:'Painted Ladies',x:-210,z:-90,w:16,d:14,h:14,district:'sf',shape:'houses'},
 {id:'dragon-gate',name:'Chinatown Dragon Gate',x:30,z:-90,w:16,d:12,h:13,district:'sf',shape:'gate'},
 {id:'sutro-tower',name:'Sutro Tower',x:-270,z:-30,w:14,d:14,h:32,district:'sf',shape:'radio'},
 {id:'cable-car-museum',name:'Cable Car Museum',x:-210,z:-30,w:16,d:14,h:13,district:'sf',shape:'plaza'},
 {id:'sf-city-hall',name:'San Francisco City Hall',x:-150,z:-30,w:16,d:16,h:23,district:'sf',shape:'civic'},
 {id:'asian-art-museum',name:'Asian Art Museum',x:-90,z:-30,w:16,d:14,h:14,district:'sf',shape:'library'},
 {id:'castro-theatre',name:'Castro Theatre',x:-330,z:30,w:16,d:14,h:20,district:'sf',shape:'theatre'},
 {id:'mission-dolores',name:'Mission Dolores',x:-270,z:30,w:16,d:14,h:14,district:'sf',shape:'mission'},
 {id:'war-memorial-opera',name:'War Memorial Opera House',x:-210,z:30,w:16,d:14,h:15,district:'sf',shape:'opera'},
 {id:'bill-graham',name:'Bill Graham Civic Auditorium',x:-150,z:30,w:16,d:14,h:15,district:'sf',shape:'opera'},
 {id:'orpheum',name:'Orpheum Theatre',x:-90,z:30,w:16,d:14,h:18,district:'sf',shape:'theatre'},
 {id:'sfmoma',name:'San Francisco Museum of Modern Art',x:-30,z:30,w:16,d:14,h:21,district:'sf',shape:'modern'},
 {id:'oracle-park',name:'Oracle Park',x:30,z:90,w:16,d:16,h:13,district:'sf',shape:'stadium'},
 {id:'chase-center',name:'Chase Center',x:-30,z:90,w:16,d:16,h:14,district:'sf',shape:'stadium'},
 {id:'point-bonita',name:'Point Bonita Lighthouse',x:-380,z:-520,w:12,d:12,h:19,district:'sf',shape:'lighthouse'},
 {id:'battery-spencer',name:'Battery Spencer',x:-300,z:-480,w:16,d:14,h:8,district:'sf',shape:'battery'},
 {id:'fort-baker',name:'Fort Baker',x:-160,z:-445,w:16,d:14,h:12,district:'sf',shape:'barracks'},
 {id:'fort-cronkhite',name:'Fort Cronkhite',x:-380,z:-480,w:16,d:14,h:12,district:'sf',shape:'barracks'},
 {id:'nike-site',name:'Marin Headlands Nike Site',x:-340,z:-520,w:16,d:14,h:15,district:'sf',shape:'missile'},
 {id:'oakland-fox',name:'Fox Theater Oakland',x:420,z:-150,w:16,d:14,h:21,district:'oakland',shape:'theatre'},
 {id:'paramount',name:'Paramount Theatre Oakland',x:480,z:-150,w:16,d:14,h:22,district:'oakland',shape:'theatre'},
 {id:'oakland-city-hall',name:'Oakland City Hall',x:420,z:-30,w:16,d:14,h:27,district:'oakland',shape:'civic'},
 {id:'grand-lake',name:'Grand Lake Theatre',x:540,z:90,w:16,d:14,h:19,district:'oakland',shape:'theatre'},
 {id:'christ-the-light',name:'Cathedral of Christ the Light',x:480,z:90,w:16,d:14,h:22,district:'oakland',shape:'crystal'},
 {id:'fairyland',name:'Children’s Fairyland',x:540,z:210,w:16,d:14,h:15,district:'oakland',shape:'castle'},
 {id:'jack-london',name:'Jack London Square',x:360,z:30,w:16,d:14,h:13,district:'oakland',shape:'pier'},
 {id:'oakland-museum',name:'Oakland Museum of California',x:480,z:30,w:16,d:14,h:11,district:'oakland',shape:'museum'},
 {id:'oakland-temple',name:'Oakland California Temple',x:590,z:-30,w:16,d:14,h:24,district:'oakland',shape:'temple'},
 {id:'mountain-view-cemetery',name:'Mountain View Cemetery Gate',x:590,z:-150,w:16,d:12,h:12,district:'oakland',shape:'gate'},
 {id:'sather-gate',name:'Sather Gate',x:480,z:-210,w:16,d:12,h:12,district:'oakland',shape:'gate'},
 {id:'greek-theatre',name:'Berkeley Greek Theatre',x:420,z:-210,w:16,d:16,h:9,district:'oakland',shape:'greek'},
 {id:'doe-library',name:'Doe Memorial Library',x:360,z:-210,w:16,d:14,h:15,district:'oakland',shape:'library'},
];

/** Summit markers for the corresponding authored, drivable hills in shared/map.ts. */
export const NORTH_NATURAL_LANDMARKS = [
 {id:'twin-peaks',name:'Twin Peaks',x:-330,z:150},
 {id:'mount-tamalpais',name:'Mount Tamalpais',x:-340,z:-445},
] as const;
