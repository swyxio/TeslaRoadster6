/** Small original interpretations on the compressed game map, not survey data.
 * Sources: Oakland Zoo https://www.oaklandzoo.org/explore-the-zoo/;
 * Chabot https://chabotspace.org/visit/observatories/;
 * NASA Ames https://historicproperties.arc.nasa.gov/summary.html;
 * Levi's Stadium https://levisstadium.com/contact-us/.
 */
export type EastSouthAddition={
 id:string; name:string; x:number; z:number; w:number; d:number; h:number;
 district:'east-bay'|'south-bay'|'peninsula'; style:'landmark';
};

/** These envelopes are also the solid, shared simulation geometry. */
export const EAST_SOUTH_ADDITIONS:readonly EastSouthAddition[]=[
 {id:'chabot-space',name:'Chabot Space & Science Center',x:720,z:600,w:35,d:30,h:20,district:'east-bay',style:'landmark'},
 {id:'oakland-zoo',name:'Oakland Zoo',x:920,z:1010,w:48,d:34,h:20,district:'east-bay',style:'landmark'},
 {id:'nasa-ames',name:'NASA Ames Research Center',x:-280,z:5030,w:50,d:38,h:22,district:'peninsula',style:'landmark'},
 {id:'levis-stadium',name:'Levi’s Stadium',x:220,z:6660,w:64,d:46,h:22,district:'south-bay',style:'landmark'},
];
