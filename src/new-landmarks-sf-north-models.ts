import type { LandmarkModel, LandmarkParts } from './landmark-model-types';

/** Hand-authored details are relative to the shared collision envelope. */
export function buildSfNorthLandmark(p:LandmarkModel, part:LandmarkParts):boolean {
  const {w,d,h}=p;
  const {box,cyl,roof,dome}=part;
  const cream=0xe4dec9, white=0xece8dc, stone=0xbcb4a3, dark=0x405254;
  const glass=0x789ca1, foliage=0x557f5e, wood=0x77543d, copper=0x51766c;

  switch(p.id){
    case 'dutch-windmill': {
      // The static four-sail cross is kept inside the windmill's footprint.
      cyl(0,h*.31,0,w*.46,h*.62,d*.44,white);
      cyl(0,h*.64,0,w*.50,h*.08,d*.48,wood);
      roof(0,h*.75,0,w*.58,h*.18,d*.56,copper);
      box(0,h*.20,d*.225,w*.16,h*.28,d*.025,wood);
      box(0,h*.50,d*.235,w*.10,h*.12,d*.025,dark);
      box(0,h*.59,d*.34,w*.84,h*.035,d*.035,wood);
      box(0,h*.59,d*.34,w*.035,h*.64,d*.035,wood);
      for(const sign of [-1,1]){
        box(sign*w*.27,h*.59,d*.345,w*.22,h*.10,d*.028,cream);
        box(0,h*(.59+sign*.23),d*.345,w*.10,h*.20,d*.028,cream);
      }
      cyl(0,h*.59,d*.36,w*.075,h*.07,d*.04,wood);
      return true;
    }
    case 'marin-civic-center': {
      // Low arcaded wings, distinctive blue dome, and gold spire.
      box(0,h*.23,0,w*.90,h*.46,d*.76,cream);
      box(0,h*.49,0,w*.94,h*.08,d*.80,0x8db2c6);
      for(let i=-3;i<=3;i++){
        const x=i*w*.115;
        box(x,h*.23,d*.385,w*.07,h*.28,d*.018,glass);
        box(x,h*.16,-d*.385,w*.07,h*.19,d*.018,glass);
      }
      for(const sign of [-1,1])box(sign*w*.44,h*.27,0,w*.06,h*.54,d*.78,cream);
      cyl(0,h*.54,0,w*.43,h*.12,d*.44,cream);
      dome(0,h*.60,0,w*.42,h*.20,d*.43,0x7dabc7);
      cyl(0,h*.88,0,w*.025,h*.24,d*.025,0xd8b65b);
      return true;
    }
    case 'muir-woods': {
      // Entrance arch and a compact grove; existing terrain is unchanged.
      box(0,h*.025,0,w*.94,h*.05,d*.92,0x75936d);
      for(const [x,z,height] of [[-.31,-.22,.92],[0,-.27,.96],[.31,-.21,.88],[-.34,.12,.72],[.34,.12,.76]] as const){
        const trunkH=h*height*.70;
        cyl(x*w,trunkH/2,z*d,w*.065,trunkH,d*.065,0x85563b);
        roof(x*w,h*height*.69,z*d,w*.22,h*height*.58,d*.22,0x386a4d);
        roof(x*w,h*height*.79,z*d,w*.15,h*height*.38,d*.15,0x427a53);
      }
      for(const side of [-1,1])box(side*w*.16,h*.19,d*.30,w*.055,h*.38,d*.055,wood);
      box(0,h*.36,d*.30,w*.38,h*.055,d*.075,wood);
      return true;
    }
    case 'columbus-tower': {
      // Three tapered tiers evoke the triangular Sentinel Building footprint.
      const bodyH=h*.66;
      box(0,bodyH/2,-d*.27,w*.83,bodyH,d*.27,cream);
      box(0,bodyH/2,0,w*.59,bodyH,d*.27,cream);
      box(0,bodyH/2,d*.27,w*.30,bodyH,d*.27,cream);
      for(const y of [.22,.38,.54]){
        box(0,h*y,-d*.414,w*.73,h*.055,d*.012,copper);
        box(0,h*y,d*.414,w*.24,h*.055,d*.012,copper);
      }
      box(0,h*.68,-d*.13,w*.70,h*.045,d*.57,copper);
      cyl(0,h*.75,-d*.12,w*.30,h*.12,d*.30,cream);
      roof(0,h*.87,-d*.12,w*.45,h*.20,d*.46,copper);
      cyl(0,h*.98,-d*.12,w*.035,h*.04,d*.035,copper);
      return true;
    }
    case 'salesforce-transit-center': {
      // White perimeter lattice and planted roof identify the transit center.
      box(0,h*.31,0,w*.92,h*.62,d*.80,white);
      for(const side of [-1,1]){
        box(0,h*.36,side*d*.405,w*.83,h*.37,d*.015,glass);
        for(let i=-4;i<=4;i++)box(i*w*.09,h*.36,side*d*.42,w*.025,h*.37,d*.015,white);
        for(const y of [.22,.36,.50])box(0,h*y,side*d*.43,w*.86,h*.025,d*.015,white);
      }
      box(0,h*.65,0,w*.88,h*.06,d*.76,0xb7bea9);
      box(0,h*.70,0,w*.78,h*.06,d*.66,foliage);
      for(const x of [-.25,0,.25]){
        cyl(x*w,h*.79,0,w*.025,h*.14,d*.025,wood);
        roof(x*w,h*.88,0,w*.16,h*.21,d*.20,0x477957);
      }
      return true;
    }
    case 'sf-armory': {
      // Reddish brick walls, corner towers and alternating battlements.
      const brick=0x9b6150;
      box(0,h*.32,0,w*.78,h*.64,d*.75,brick);
      for(const x of [-.34,.34])for(const z of [-.31,.31]){
        box(x*w,h*.39,z*d,w*.18,h*.78,d*.18,brick);
        for(const dx of [-.055,.055])box((x+dx)*w,h*.83,z*d,w*.055,h*.10,d*.18,cream);
      }
      box(0,h*.20,d*.385,w*.17,h*.35,d*.02,dark);
      for(const x of [-.22,0,.22])box(x*w,h*.50,d*.385,w*.075,h*.17,d*.02,dark);
      return true;
    }
    case 'haas-lilienthal': {
      // A single Queen Anne house with a corner turret and steep roof.
      box(0,h*.30,0,w*.76,h*.60,d*.67,0xd4ded4);
      roof(0,h*.69,0,w*.86,h*.20,d*.77,0x6c6864);
      cyl(-w*.29,h*.38,d*.24,w*.25,h*.76,d*.24,0xd4ded4);
      roof(-w*.29,h*.85,d*.24,w*.30,h*.27,d*.30,0x6c6864);
      for(const x of [-.02,.22])for(const y of [.22,.42])box(x*w,y*h,d*.345,w*.11,h*.12,d*.025,glass);
      box(w*.10,h*.12,d*.355,w*.09,h*.20,d*.025,wood);
      box(0,h*.53,d*.355,w*.52,h*.025,d*.025,white);
      return true;
    }
    case 'contemporary-jewish': {
      // Blue faceted addition beside the preserved brick power station.
      box(-w*.17,h*.28,0,w*.56,h*.56,d*.74,0xa46d5e);
      roof(-w*.17,h*.63,0,w*.56,h*.14,d*.74,0x706967);
      box(w*.20,h*.48,0,w*.42,h*.70,d*.67,0x3a607d);
      roof(w*.20,h*.87,0,w*.42,h*.08,d*.67,0x496f89);
      for(const y of [.28,.45,.62])box(w*.20,h*y,d*.345,w*.28,h*.025,d*.02,0x7997a8);
      return true;
    }
    case 'dewey-monument': {
      // A pale column, topped by a small bronze winged figure.
      box(0,h*.055,0,w*.54,h*.11,d*.54,stone);
      box(0,h*.13,0,w*.36,h*.04,d*.36,cream);
      cyl(0,h*.47,0,w*.14,h*.64,d*.14,cream);
      cyl(0,h*.80,0,w*.22,h*.06,d*.22,cream);
      cyl(0,h*.90,0,w*.08,h*.14,d*.08,0x506b61);
      cyl(0,h*.99,0,w*.06,h*.02,d*.06,0x506b61);
      box(0,h*.91,0,w*.32,h*.035,d*.035,0x506b61);
      return true;
    }
    case 'city-lights': {
      // The North Beach bookstore has a pale upper facade and dark storefront.
      box(0,h*.39,0,w*.78,h*.78,d*.72,cream);
      box(0,h*.16,d*.37,w*.68,h*.28,d*.025,0x35594e);
      for(const x of [-.24,0,.24]){
        box(x*w,h*.52,d*.37,w*.14,h*.20,d*.025,dark);
        box(x*w,h*.25,d*.39,w*.15,h*.14,d*.025,glass);
      }
      box(0,h*.34,d*.39,w*.75,h*.055,d*.035,white);
      box(0,h*.80,0,w*.84,h*.04,d*.78,white);
      return true;
    }
    case 'saint-ignatius': {
      // Twin towers and the green central dome of the hilltop church.
      box(0,h*.23,0,w*.70,h*.46,d*.76,cream);
      roof(0,h*.50,0,w*.72,h*.10,d*.76,stone);
      for(const side of [-1,1]){
        box(side*w*.28,h*.38,d*.19,w*.18,h*.76,d*.22,cream);
        box(side*w*.28,h*.58,d*.305,w*.07,h*.18,d*.018,dark);
        roof(side*w*.28,h*.84,d*.19,w*.20,h*.16,d*.24,copper);
        cyl(side*w*.28,h*.94,d*.19,w*.025,h*.04,d*.025,stone);
      }
      cyl(0,h*.49,-d*.08,w*.32,h*.12,d*.32,stone);
      dome(0,h*.55,-d*.08,w*.34,h*.19,d*.34,copper);
      box(0,h*.80,-d*.08,w*.025,h*.12,d*.025,stone);
      box(0,h*.82,-d*.08,w*.10,h*.025,d*.025,stone);
      box(0,h*.16,d*.39,w*.13,h*.28,d*.02,dark);
      return true;
    }
    case 'golden-gate-bandshell': {
      // A concert stage under a pale domed canopy and rows of columns.
      box(0,h*.05,0,w*.90,h*.10,d*.88,stone);
      box(0,h*.31,-d*.15,w*.78,h*.52,d*.30,cream);
      box(0,h*.30,d*.012,w*.54,h*.42,d*.02,dark);
      for(const side of [-1,1])for(const x of [.29,.39]){
        cyl(side*w*x,h*.32,d*.25,w*.065,h*.54,d*.065,cream);
      }
      box(0,h*.61,0,w*.84,h*.08,d*.76,cream);
      dome(0,h*.65,0,w*.74,h*.24,d*.64,white);
      box(0,h*.13,d*.28,w*.62,h*.08,d*.20,stone);
      return true;
    }
    case 'sf-old-mint': {
      // Granite facade, central portico and six columns of the Old Mint.
      box(0,h*.32,0,w*.84,h*.64,d*.72,stone);
      for(let i=-2.5;i<=2.5;i++)cyl(i*w*.105,h*.31,d*.39,w*.055,h*.52,d*.055,cream);
      box(0,h*.57,d*.39,w*.68,h*.06,d*.08,cream);
      roof(0,h*.68,d*.35,w*.72,h*.16,d*.14,cream);
      box(0,h*.18,d*.43,w*.15,h*.30,d*.02,dark);
      box(0,h*.75,0,w*.86,h*.06,d*.74,cream);
      return true;
    }
    case 'fairmont-sf': {
      box(0,h*.39,0,w*.82,h*.78,d*.72,cream);
      for(const x of [-.30,-.15,0,.15,.30])for(const y of [.25,.40,.55,.70])
        box(x*w,y*h,d*.37,w*.07,h*.085,d*.02,glass);
      box(0,h*.80,0,w*.86,h*.05,d*.76,stone);
      box(0,h*.16,d*.40,w*.34,h*.08,d*.14,stone);
      for(const x of [-.14,.14])box(x*w,h*.10,d*.42,w*.04,h*.20,d*.04,white);
      return true;
    }
    case 'hallidie-building': {
      // Large early curtain-wall glass panes framed by light metal mullions.
      box(0,h*.40,0,w*.78,h*.80,d*.70,stone);
      box(0,h*.40,d*.355,w*.68,h*.68,d*.02,0x6b9298);
      for(const x of [-.31,-.15,0,.15,.31])box(x*w,h*.40,d*.37,w*.025,h*.68,d*.025,white);
      for(const y of [.08,.22,.36,.50,.64,.74])box(0,y*h,d*.375,w*.70,h*.025,d*.025,white);
      box(0,h*.82,0,w*.82,h*.04,d*.74,cream);
      return true;
    }
    case 'presidio-tunnel-tops': {
      // Landscaped overlook on the park; this does not imply a drivable tunnel.
      box(0,h*.08,0,w*.92,h*.16,d*.88,stone);
      box(0,h*.18,0,w*.90,h*.05,d*.86,foliage);
      for(const side of [-1,1]){
        cyl(side*w*.30,h*.31,-d*.20,w*.035,h*.23,d*.035,wood);
        roof(side*w*.30,h*.53,-d*.20,w*.18,h*.26,d*.20,0x497956);
        box(side*w*.23,h*.23,d*.24,w*.22,h*.05,d*.06,wood);
      }
      box(0,h*.21,-d*.40,w*.78,h*.035,d*.025,white);
      return true;
    }
    case 'china-camp': {
      // A pair of wooden fishing-village cabins on short piles.
      box(0,h*.11,0,w*.90,h*.08,d*.80,wood);
      for(const x of [-.37,.37])for(const z of [-.31,.31])
        box(x*w,h*.05,z*d,w*.055,h*.10,d*.055,wood);
      for(const x of [-.21,.21]){
        box(x*w,h*.36,0,w*.32,h*.42,d*.48,0xc3ae89);
        roof(x*w,h*.65,0,w*.36,h*.16,d*.54,0x835647);
        box(x*w,h*.35,d*.25,w*.10,h*.18,d*.02,dark);
      }
      return true;
    }
    case 'fort-mason': {
      // Long, pitched-roof waterfront warehouses and a low dock apron.
      box(0,h*.06,0,w*.94,h*.12,d*.90,stone);
      for(const z of [-.22,.22]){
        box(0,h*.31,z*d,w*.80,h*.50,d*.31,0xd5c6b4);
        roof(0,h*.65,z*d,w*.84,h*.18,d*.33,0x9c6558);
        for(const x of [-.28,-.14,0,.14,.28])box(x*w,h*.29,(z+.16)*d,w*.07,h*.18,d*.015,dark);
      }
      return true;
    }
    case 'presidio-officers-club': {
      // Whitewashed adobe, red-tiled roof and a shaded loggia.
      box(0,h*.29,-d*.04,w*.84,h*.58,d*.72,cream);
      roof(0,h*.67,-d*.04,w*.90,h*.18,d*.76,0xaa6c58);
      for(const x of [-.33,-.16,0,.16,.33]){
        box(x*w,h*.20,d*.34,w*.04,h*.40,d*.04,white);
        if(x!==0)box(x*w,h*.26,d*.335,w*.075,h*.15,d*.015,glass);
      }
      box(0,h*.15,d*.335,w*.10,h*.27,d*.015,wood);
      box(0,h*.42,d*.36,w*.78,h*.04,d*.06,white);
      return true;
    }
    case 'disney-family-museum': {
      // Former red-brick barracks with regularly spaced tall windows.
      box(0,h*.31,0,w*.88,h*.62,d*.72,0x9e6658);
      roof(0,h*.71,0,w*.92,h*.18,d*.78,0x73645d);
      for(const x of [-.35,-.21,-.07,.07,.21,.35])for(const y of [.24,.45])
        box(x*w,y*h,d*.37,w*.075,h*.12,d*.025,cream);
      box(0,h*.14,d*.39,w*.10,h*.26,d*.03,dark);
      box(0,h*.62,0,w*.90,h*.025,d*.76,cream);
      return true;
    }
    case 'letterman-digital-arts': {
      // Presidio campus, red rooflines and a little courtyard fountain.
      box(0,h*.28,-d*.16,w*.82,h*.56,d*.40,0xd6c8b2);
      roof(0,h*.63,-d*.16,w*.86,h*.14,d*.44,0xaa715e);
      for(const x of [-.30,-.15,0,.15,.30])box(x*w,h*.28,d*.055,w*.08,h*.17,d*.02,glass);
      cyl(0,h*.07,d*.26,w*.27,h*.14,d*.27,stone);
      cyl(0,h*.145,d*.26,w*.23,h*.018,d*.23,0x86b8ba);
      cyl(0,h*.20,d*.26,w*.05,h*.10,d*.05,stone);
      return true;
    }
    case 'hyde-street-pier': {
      // A timber pier and its waterside shed; the ships are temporarily away.
      box(0,h*.06,0,w*.92,h*.12,d*.88,wood);
      box(0,h*.32,-d*.17,w*.58,h*.40,d*.36,cream);
      roof(0,h*.62,-d*.17,w*.62,h*.20,d*.40,0x916754);
      box(0,h*.25,d*.02,w*.14,h*.28,d*.02,dark);
      for(const side of [-1,1]){
        for(const z of [.10,.27,.40])box(side*w*.40,h*.15,z*d,w*.035,h*.20,d*.035,wood);
        box(side*w*.40,h*.25,d*.25,w*.035,h*.035,d*.38,wood);
      }
      return true;
    }
    case 'kezar-stadium': {
      // Oval bleachers surround a red running track and green playing field.
      cyl(0,h*.16,0,w*.92,h*.32,d*.90,stone);
      cyl(0,h*.325,0,w*.80,h*.025,d*.78,0xab6559);
      cyl(0,h*.34,0,w*.61,h*.025,d*.57,foliage);
      for(const x of [-.27,0,.27])box(x*w,h*.36,0,w*.015,h*.015,d*.49,white);
      box(0,h*.38,0,w*.52,h*.025,d*.025,white);
      return true;
    }
    case 'sf-main-library': {
      // Pale modern tiers with a recessed glass entrance.
      box(0,h*.28,0,w*.88,h*.56,d*.78,cream);
      box(0,h*.63,0,w*.72,h*.14,d*.68,white);
      box(0,h*.31,d*.40,w*.42,h*.43,d*.02,glass);
      for(const x of [-.19,0,.19])box(x*w,h*.31,d*.415,w*.025,h*.43,d*.02,white);
      for(const y of [.15,.29,.43])box(0,y*h,d*.42,w*.44,h*.025,d*.02,white);
      return true;
    }
    case 'glbt-history-museum': {
      // Neighborhood storefront with a rainbow band across the facade.
      box(0,h*.30,0,w*.80,h*.60,d*.70,0xd7c5b4);
      box(0,h*.25,d*.355,w*.60,h*.35,d*.02,dark);
      for(let i=0;i<6;i++)box(0,h*(.43+i*.03),d*.37,w*.60,h*.026,d*.02,
        [0xc74a4a,0xdf8d47,0xe3c65e,0x6b9f67,0x608fb3,0x9676a8][i]);
      box(0,h*.62,0,w*.84,h*.04,d*.74,cream);
      return true;
    }
    case 'mission-san-rafael': {
      // Small mission chapel, red tile and a simple bell tower.
      box(0,h*.28,0,w*.72,h*.56,d*.66,cream);
      roof(0,h*.64,0,w*.78,h*.16,d*.72,0xb2735e);
      box(-w*.30,h*.43,d*.16,w*.16,h*.86,d*.19,cream);
      roof(-w*.30,h*.90,d*.16,w*.20,h*.08,d*.24,0xb2735e);
      box(-w*.30,h*.64,d*.26,w*.08,h*.10,d*.015,dark);
      box(w*.08,h*.16,d*.34,w*.12,h*.27,d*.02,wood);
      return true;
    }
    case 'bay-model': {
      // A wide, gabled Marinship-era industrial hall with clerestory windows.
      box(0,h*.28,0,w*.88,h*.56,d*.74,0xcfc9b9);
      roof(0,h*.67,0,w*.92,h*.22,d*.78,0x7c8b85);
      for(const x of [-.33,-.17,0,.17,.33]){
        box(x*w,h*.36,d*.38,w*.095,h*.16,d*.02,glass);
      }
      box(0,h*.14,d*.39,w*.16,h*.24,d*.03,dark);
      box(0,h*.56,0,w*.90,h*.03,d*.76,white);
      return true;
    }
    case 'flood-building': {
      // A broad pale Market Street office block with a clipped corner.
      box(0,h*.39,-d*.10,w*.82,h*.78,d*.65,cream);
      box(-w*.16,h*.39,d*.29,w*.50,h*.78,d*.18,cream);
      for(const x of [-.30,-.15,0,.15,.30])for(const y of [.20,.35,.50,.65])
        box(x*w,y*h,-d*.43,w*.065,h*.08,d*.02,glass);
      box(0,h*.80,-d*.08,w*.86,h*.04,d*.70,stone);
      return true;
    }
    case 'audiffred-building': {
      // Red brick at the Embarcadero, with a dark mansard-like roofline.
      box(0,h*.31,0,w*.84,h*.62,d*.72,0xa56555);
      roof(0,h*.73,0,w*.88,h*.22,d*.78,0x5a6662);
      for(const x of [-.30,-.15,0,.15,.30]){
        box(x*w,h*.40,d*.37,w*.08,h*.16,d*.02,cream);
        box(x*w,h*.18,d*.37,w*.09,h*.19,d*.02,dark);
      }
      box(0,h*.62,0,w*.86,h*.035,d*.74,cream);
      return true;
    }
    case 'palace-hotel': {
      // A symmetrical cream hotel with a formal central entrance.
      box(0,h*.38,0,w*.88,h*.76,d*.74,cream);
      for(const x of [-.35,-.21,-.07,.07,.21,.35])for(const y of [.25,.40,.55,.70])
        box(x*w,y*h,d*.38,w*.065,h*.08,d*.02,glass);
      box(0,h*.78,0,w*.90,h*.04,d*.78,stone);
      box(0,h*.17,d*.40,w*.30,h*.07,d*.15,stone);
      for(const x of [-.13,.13])box(x*w,h*.10,d*.42,w*.035,h*.20,d*.035,white);
      return true;
    }
    case 'sf-columbarium': {
      // The circular neo-classical landmark and copper-colored dome.
      cyl(0,h*.30,0,w*.78,h*.60,d*.78,cream);
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        cyl(Math.cos(a)*w*.34,h*.30,Math.sin(a)*d*.34,w*.055,h*.54,d*.055,white);
      }
      cyl(0,h*.63,0,w*.82,h*.06,d*.82,stone);
      dome(0,h*.66,0,w*.68,h*.25,d*.68,copper);
      cyl(0,h*.94,0,w*.07,h*.06,d*.07,stone);
      return true;
    }
    case 'childrens-creativity': {
      // Colorful low-rise arts center in the Yerba Buena gardens.
      box(0,h*.27,0,w*.84,h*.54,d*.74,0xc4b9a6);
      box(0,h*.56,0,w*.88,h*.04,d*.78,0x93877f);
      box(0,h*.30,d*.38,w*.60,h*.29,d*.02,glass);
      for(const x of [-.28,0,.28])box(x*w,h*.30,d*.395,w*.025,h*.30,d*.02,white);
      for(const x of [-.22,0,.22])cyl(x*w,h*.64,-d*.15,w*.08,h*.12,d*.08,[0xd18b5d,0x88a975,0x8c8cbb][Math.round(x/.22)+1]);
      return true;
    }
    case 'moad': {
      // A contemporary glass street frontage for the downtown museum.
      box(0,h*.38,0,w*.78,h*.76,d*.70,0x9eaaa5);
      box(0,h*.38,d*.355,w*.68,h*.66,d*.02,glass);
      for(const x of [-.30,-.15,0,.15,.30])box(x*w,h*.38,d*.37,w*.025,h*.66,d*.02,white);
      for(const y of [.12,.28,.44,.60])box(0,y*h,d*.375,w*.70,h*.025,d*.02,white);
      box(0,h*.12,d*.39,w*.22,h*.18,d*.025,dark);
      return true;
    }
    case 'sf-craft-design': {
      // Dogpatch brick warehouse, with broad workshop windows.
      box(0,h*.30,0,w*.86,h*.60,d*.74,0xa77561);
      box(0,h*.62,0,w*.90,h*.04,d*.78,stone);
      for(const x of [-.27,-.09,.09,.27]){
        box(x*w,h*.33,d*.38,w*.13,h*.29,d*.02,glass);
        box(x*w,h*.33,d*.395,w*.025,h*.29,d*.02,dark);
      }
      box(0,h*.13,d*.40,w*.12,h*.24,d*.02,dark);
      return true;
    }
    default:return false;
  }
}
