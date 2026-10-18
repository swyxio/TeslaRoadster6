import type { LandmarkModel, LandmarkParts } from './landmark-model-types';

/** Original simplified silhouettes fitted inside the shared collision envelope. */
export function buildEastBayLandmark(p:LandmarkModel, part:LandmarkParts):boolean {
  const {w,d,h}=p, {box,cyl,roof,dome}=part;
  const cream=0xe1d9c5, stone=0xc7bda8, red=0xab6255, dark=0x405c60;
  const glass=0x86aeb0, green=0x598471, gold=0xd9b571;

  switch(p.id){
    case 'new-uss-hornet': {
      // Long hull, flight deck, offset island and deck markings. The museum is
      // represented on compressed Oakland shore, rather than on a new island.
      box(0,h*.14,0,w*.60,h*.28,d*.89,dark);
      box(0,h*.30,0,w*.84,h*.05,d*.94,stone);
      for(let i=-2;i<=2;i++) box(-w*.12,h*.329,i*d*.14,w*.035,h*.008,d*.085,cream);
      box(w*.23,h*.44,-d*.1,w*.22,h*.25,d*.24,dark);
      box(w*.23,h*.59,-d*.1,w*.19,h*.06,d*.21,cream);
      box(w*.23,h*.69,-d*.1,w*.06,h*.16,d*.06,dark);
      // Two miniature parked aircraft make the flight deck legible from above.
      for(const z of [-.22,.22]){
        box(-w*.22,h*.35,z*d,w*.18,h*.025,d*.045,cream);
        box(-w*.22,h*.35,z*d,w*.055,h*.025,d*.15,cream);
      }
      return true;
    }
    case 'new-rosie-memorial': {
      // The ship-frame memorial's open ribs and central keel walk.
      box(0,h*.035,0,w*.88,h*.07,d*.90,stone);
      box(0,h*.075,0,w*.10,h*.01,d*.84,cream);
      for(let i=-2;i<=2;i++){
        const height=h*(.43+(2-Math.abs(i))*.16), z=i*d*.17;
        for(const side of [-1,1]) box(side*w*.30,height/2+h*.07,z,w*.045,height,d*.045,cream);
        box(0,height+h*.07,z,w*.64,h*.045,d*.045,cream);
      }
      return true;
    }
    case 'new-berkeley-bampfa': {
      // Streamline Moderne printing plant plus the stepped stainless theater.
      box(-w*.24,h*.25,0,w*.32,h*.50,d*.70,cream);
      box(w*.12,h*.30,0,w*.55,h*.60,d*.72,glass);
      box(w*.12,h*.65,-d*.06,w*.55,h*.14,d*.60,stone);
      box(w*.14,h*.75,-d*.08,w*.47,h*.07,d*.50,cream);
      for(let i=-3;i<=3;i++) box(w*(.12+i*.037),h*.30,d*.365,w*.012,h*.55,d*.012,cream);
      box(-w*.24,h*.27,d*.36,w*.22,h*.26,d*.018,dark);
      return true;
    }
    case 'new-lawrence-hall': {
      // Concrete terraces and the horizontal DNA sculpture in the plaza.
      box(0,h*.24,-d*.12,w*.83,h*.48,d*.58,stone);
      box(w*.15,h*.53,-d*.15,w*.48,h*.12,d*.46,cream);
      box(w*.10,h*.31,d*.175,w*.48,h*.20,d*.02,glass);
      box(0,h*.035,d*.31,w*.82,h*.07,d*.30,cream);
      for(let i=0;i<7;i++){
        const x=w*(-.32+i*.095), wave=Math.sin(i*Math.PI/3)*d*.06;
        box(x,h*.13,d*.31+wave,w*.05,h*.05,d*.04,gold);
        box(x,h*.13,d*.31-wave,w*.05,h*.05,d*.04,dark);
        box(x,h*.13,d*.31,w*.025,h*.025,d*.12,stone);
      }
      return true;
    }
    case 'new-tilden-steam-trains': {
      // A stationary miniature steam locomotive and small gabled depot.
      box(0,h*.035,0,w*.9,h*.04,d*.31,stone);
      for(const side of [-1,1]) box(0,h*.065,side*d*.115,w*.88,h*.025,d*.025,dark);
      box(-w*.20,h*.32,0,w*.25,h*.46,d*.26,red);
      box(-w*.20,h*.57,0,w*.29,h*.04,d*.30,dark);
      box(w*.10,h*.27,0,w*.40,h*.28,d*.23,dark);
      cyl(w*.30,h*.52,0,w*.08,h*.28,d*.08,dark);
      box(w*.30,h*.68,0,w*.12,h*.045,d*.12,stone);
      for(const side of [-1,1]) for(const x of [-.22,-.06,.10,.24])
        box(w*x,h*.12,side*d*.15,w*.09,h*.12,d*.045,dark);
      box(0,h*.24,-d*.34,w*.62,h*.42,d*.24,cream);
      roof(0,h*.50,-d*.34,w*.66,h*.14,d*.25,red);
      return true;
    }
    case 'new-oakland-coliseum':
    case 'new-california-memorial-stadium': {
      // Open field, four blocks of seating and a taller Oakland outfield stand.
      box(0,h*.09,0,w*.92,h*.18,d*.92,stone);
      box(0,h*.195,0,w*.56,h*.03,d*.56,green);
      for(const side of [-1,1]){
        box(side*w*.37,h*.25,0,w*.16,h*.35,d*.80,cream);
        box(0,h*.25,side*d*.37,w*.58,h*.35,d*.16,cream);
      }
      if(p.id==='new-oakland-coliseum') box(0,h*.42,-d*.38,w*.75,h*.68,d*.15,stone);
      for(const x of [-.39,.39]) for(const z of [-.39,.39]){
        box(x*w,h*.52,z*d,w*.025,h*.90,d*.025,dark);
        box(x*w,h*.97,z*d,w*.10,h*.04,d*.07,cream);
      }
      return true;
    }
    case 'new-oakland-arena': {
      // A separate, roofed arena beside the open Coliseum.
      cyl(0,h*.27,0,w*.88,h*.54,d*.88,stone);
      dome(0,h*.54,0,w*.86,h*.30,d*.86,cream);
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        box(Math.cos(a)*w*.40,h*.30,Math.sin(a)*d*.40,w*.035,h*.54,d*.035,dark);
      }
      return true;
    }
    case 'new-tilden-merry-go-round': {
      // Open carousel pavilion, pole, platform and miniature horses.
      cyl(0,h*.07,0,w*.88,h*.14,d*.88,red);
      cyl(0,h*.43,0,w*.07,h*.70,d*.07,gold);
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4, x=Math.cos(a)*w*.30, z=Math.sin(a)*d*.30;
        box(x,h*.40,z,w*.025,h*.65,d*.025,cream);
        box(x,h*.25,z,w*.09,h*.10,d*.05,stone);
      }
      roof(0,h*.82,0,w*.92,h*.26,d*.92,red);
      return true;
    }
    case 'new-hayward-shoreline-center': {
      // The real interpretive center is a marsh building raised on stilts.
      for(const x of [-.3,.3]) for(const z of [-.27,.27])
        box(x*w,h*.20,z*d,w*.06,h*.40,d*.06,dark);
      box(0,h*.48,0,w*.80,h*.34,d*.75,cream);
      for(const x of [-.25,0,.25]) box(x*w,h*.49,d*.38,w*.15,h*.17,d*.02,glass);
      roof(0,h*.75,0,w*.90,h*.25,d*.86,stone);
      return true;
    }
    case 'new-oakland-aviation-museum': {
      // Historic hangar with a static aircraft outside.
      box(0,h*.26,-d*.15,w*.82,h*.52,d*.53,stone);
      roof(0,h*.61,-d*.15,w*.88,h*.22,d*.56,cream);
      box(0,h*.27,d*.12,w*.57,h*.35,d*.025,dark);
      box(0,h*.10,d*.34,w*.64,h*.07,d*.07,cream);
      box(0,h*.10,d*.34,w*.10,h*.07,d*.23,cream);
      box(-w*.25,h*.18,d*.34,w*.05,h*.18,d*.05,red);
      return true;
    }
    case 'new-uc-botanical-garden': {
      // Glasshouses, planting beds and a small representation of the redwood grove.
      box(0,h*.04,0,w*.92,h*.08,d*.90,green);
      box(-w*.15,h*.25,-d*.05,w*.48,h*.42,d*.48,glass);
      dome(-w*.15,h*.46,-d*.05,w*.50,h*.20,d*.50,cream);
      for(const x of [-.32,-.15,.02]) box(x*w,h*.25,d*.20,w*.018,h*.42,d*.02,cream);
      for(const z of [-.26,0,.26]){
        box(w*.28,h*.12,z*d,w*.24,h*.12,d*.15,stone);
        for(const x of [.22,.30,.36]) cyl(x*w,h*.22,z*d,w*.045,h*.12,d*.045,green);
      }
      box(-w*.38,h*.37,-d*.34,w*.05,h*.58,d*.05,red);
      roof(-w*.38,h*.78,-d*.34,w*.20,h*.40,d*.20,green);
      return true;
    }
    case 'new-south-hall': {
      // Red brick Victorian building, mansard-like roof and chimney stacks.
      box(0,h*.31,0,w*.83,h*.62,d*.70,red);
      box(0,h*.64,0,w*.88,h*.06,d*.74,cream);
      roof(0,h*.76,0,w*.86,h*.20,d*.70,dark);
      for(const x of [-.30,0,.30]){
        box(x*w,h*.34,d*.36,w*.11,h*.25,d*.02,dark);
        box(x*w,h*.31,-d*.36,w*.11,h*.25,d*.02,dark);
      }
      for(const x of [-.30,.30]) box(x*w,h*.83,-d*.12,w*.08,h*.22,d*.09,red);
      return true;
    }
    case 'new-hearst-mining': {
      // Pale stone and three tall arched entrance bays under a copper roof.
      box(0,h*.31,0,w*.87,h*.62,d*.75,cream);
      box(0,h*.64,0,w*.90,h*.05,d*.79,stone);
      roof(0,h*.75,0,w*.89,h*.18,d*.78,green);
      for(const x of [-.27,0,.27]){
        box(x*w,h*.24,d*.38,w*.15,h*.35,d*.02,dark);
        dome(x*w,h*.415,d*.38,w*.15,h*.07,d*.02,dark);
      }
      box(0,h*.42,d*.39,w*.50,h*.04,d*.02,stone);
      return true;
    }
    case 'new-berkeley-city-club': {
      // Julia Morgan's concrete Little Castle: squared tower and Gothic windows.
      box(0,h*.29,0,w*.82,h*.58,d*.72,stone);
      box(-w*.27,h*.41,-d*.15,w*.25,h*.82,d*.27,cream);
      box(-w*.27,h*.85,-d*.15,w*.28,h*.06,d*.30,stone);
      for(const x of [-.20,0,.20]){
        box(x*w,h*.28,d*.37,w*.09,h*.32,d*.02,dark);
        dome(x*w,h*.44,d*.37,w*.09,h*.07,d*.02,dark);
      }
      box(w*.22,h*.31,-d*.36,w*.18,h*.28,d*.02,glass);
      return true;
    }
    case 'new-berkeley-rose-garden': {
      // Terraced beds, redwood pergola and pink/cream roses.
      box(0,h*.04,0,w*.92,h*.08,d*.90,green);
      for(let i=0;i<3;i++){
        const z=d*(-.18+i*.20), y=h*(.10+i*.08);
        box(0,y,z,w*(.76-i*.10),h*.06,d*.10,stone);
        for(const x of [-.28,-.14,0,.14,.28])
          if(Math.abs(x)<.40-i*.05)cyl(x*w,y+h*.065,z,w*.045,h*.07,d*.045,i===1?cream:red);
      }
      for(const x of [-.34,-.17,0,.17,.34]) box(x*w,h*.29,-d*.35,w*.035,h*.45,d*.035,red);
      box(0,h*.52,-d*.35,w*.72,h*.045,d*.08,red);
      return true;
    }
    case 'new-sixteenth-street-station': {
      // Historic Beaux-Arts rail terminal and its three monumental arch windows.
      box(0,h*.32,0,w*.86,h*.64,d*.70,red);
      box(0,h*.66,0,w*.90,h*.05,d*.74,cream);
      roof(0,h*.77,0,w*.88,h*.17,d*.72,stone);
      for(const x of [-.28,0,.28]){
        box(x*w,h*.30,d*.36,w*.15,h*.39,d*.02,dark);
        dome(x*w,h*.495,d*.36,w*.15,h*.08,d*.02,dark);
      }
      box(0,h*.10,d*.39,w*.84,h*.07,d*.05,stone);
      return true;
    }
    case 'new-camron-stanford': {
      // Italianate house with bay windows, veranda and railed rooftop walk.
      box(0,h*.30,-d*.04,w*.70,h*.60,d*.63,cream);
      for(const x of [-.23,.23]){
        box(x*w,h*.28,d*.30,w*.20,h*.42,d*.12,stone);
        box(x*w,h*.30,d*.37,w*.09,h*.22,d*.02,glass);
      }
      box(0,h*.62,-d*.04,w*.76,h*.05,d*.70,stone);
      box(0,h*.72,-d*.04,w*.42,h*.035,d*.33,dark);
      for(const x of [-.2,.2])box(x*w,h*.66,-d*.04,w*.025,h*.12,d*.02,cream);
      for(const x of [-.30,0,.30])box(x*w,h*.18,-d*.38,w*.035,h*.30,d*.035,cream);
      box(0,h*.34,-d*.38,w*.64,h*.035,d*.10,stone);
      return true;
    }
    case 'new-dunsmuir-hellman': {
      // Neoclassical mansion with a columned front portico and pediment.
      box(0,h*.30,-d*.06,w*.79,h*.60,d*.60,cream);
      roof(0,h*.68,-d*.06,w*.82,h*.16,d*.64,stone);
      for(const x of [-.30,-.10,.10,.30])cyl(x*w,h*.26,d*.31,w*.045,h*.48,d*.045,cream);
      box(0,h*.52,d*.31,w*.74,h*.06,d*.15,stone);
      roof(0,h*.63,d*.31,w*.72,h*.16,d*.18,cream);
      for(const x of [-.26,0,.26])box(x*w,h*.31,d*.25,w*.10,h*.22,d*.02,dark);
      return true;
    }
    case 'new-peralta-hacienda': {
      // The surviving 1870 Italianate frame house, not the former adobe.
      box(0,h*.31,0,w*.72,h*.62,d*.62,cream);
      box(0,h*.64,0,w*.80,h*.05,d*.70,stone);
      roof(0,h*.73,0,w*.78,h*.16,d*.68,red);
      for(const x of [-.25,0,.25])box(x*w,h*.35,d*.32,w*.11,h*.25,d*.02,dark);
      for(const x of [-.27,.27])box(x*w,h*.20,d*.38,w*.035,h*.36,d*.035,cream);
      box(0,h*.39,d*.38,w*.62,h*.04,d*.10,stone);
      return true;
    }
    case 'new-morcom-rose-garden': {
      // Steps and reflecting pool of Oakland's amphitheater of roses.
      box(0,h*.04,0,w*.91,h*.08,d*.90,green);
      box(0,h*.085,d*.06,w*.20,h*.01,d*.50,glass);
      for(const side of [-1,1])for(let i=0;i<3;i++){
        const x=side*w*(.18+i*.10), y=h*(.12+i*.10);
        box(x,y,0,w*.08,h*.07,d*(.62-i*.08),stone);
        for(const z of [-.22,0,.22])cyl(x,y+h*.07,z*d,w*.04,h*.07,d*.04,red);
      }
      cyl(0,h*.15,-d*.28,w*.16,h*.15,d*.16,cream);
      return true;
    }
    case 'new-aamlo': {
      // The former Carnegie library: broad masonry facade with central stair.
      box(0,h*.33,-d*.04,w*.82,h*.66,d*.65,stone);
      box(0,h*.68,-d*.04,w*.89,h*.05,d*.72,cream);
      roof(0,h*.77,-d*.04,w*.86,h*.14,d*.70,stone);
      for(const x of [-.29,-.14,0,.14,.29]){
        box(x*w,h*.34,d*.30,w*.08,h*.32,d*.02,dark);
        dome(x*w,h*.50,d*.30,w*.08,h*.05,d*.02,dark);
      }
      for(let i=0;i<3;i++)box(0,h*(.04+i*.035),d*(.39-i*.035),w*(.40-i*.04),h*.035,d*.07,cream);
      return true;
    }
    case 'new-alameda-theatre': {
      // Art Deco vertical sign, stepped marquee and recessed doors.
      box(0,h*.30,0,w*.84,h*.60,d*.70,cream);
      box(0,h*.34,d*.37,w*.70,h*.12,d*.11,gold);
      box(0,h*.61,d*.31,w*.20,h*.70,d*.12,stone);
      for(let i=0;i<4;i++)box(0,h*(.40+i*.12),d*.38,w*.09,h*.07,d*.02,red);
      for(const x of [-.22,.22])box(x*w,h*.17,d*.36,w*.14,h*.25,d*.02,dark);
      return true;
    }
    case 'new-alameda-st-joseph': {
      // Mission Revival basilica: two bell towers and red tiled roof.
      box(0,h*.26,-d*.06,w*.76,h*.52,d*.62,cream);
      roof(0,h*.57,-d*.06,w*.80,h*.14,d*.66,red);
      for(const side of [-1,1]){
        box(side*w*.31,h*.39,d*.20,w*.18,h*.78,d*.21,cream);
        dome(side*w*.31,h*.78,d*.20,w*.18,h*.10,d*.21,red);
        box(side*w*.31,h*.55,d*.31,w*.08,h*.18,d*.02,dark);
      }
      box(0,h*.26,d*.26,w*.12,h*.30,d*.02,dark);
      box(0,h*.71,-d*.06,w*.025,h*.19,d*.025,cream);
      box(0,h*.76,-d*.06,w*.10,h*.025,d*.025,cream);
      return true;
    }
    case 'new-richmond-ford-assembly': {
      // Kahn's daylight factory: red brick, long window walls and skylights.
      box(0,h*.27,0,w*.90,h*.54,d*.74,red);
      for(const x of [-.32,-.16,0,.16,.32])box(x*w,h*.28,d*.38,w*.12,h*.32,d*.02,glass);
      box(0,h*.55,0,w*.92,h*.04,d*.78,stone);
      for(const x of [-.30,0,.30])box(x*w,h*.62,0,w*.22,h*.10,d*.40,glass);
      return true;
    }
    case 'new-casa-peralta': {
      // Spanish-style villa, tiled roof, courtyard wall and patterned tiles.
      box(-w*.08,h*.27,-d*.12,w*.68,h*.54,d*.56,cream);
      roof(-w*.08,h*.61,-d*.12,w*.72,h*.16,d*.60,red);
      box(w*.28,h*.15,d*.21,w*.08,h*.30,d*.45,cream);
      box(0,h*.15,d*.40,w*.64,h*.30,d*.05,cream);
      for(const x of [-.24,-.12,0,.12,.24]) box(x*w,h*.23,d*.43,w*.065,h*.08,d*.02,glass);
      box(-w*.08,h*.26,d*.17,w*.11,h*.28,d*.02,dark);
      return true;
    }
    case 'new-meek-mansion': {
      // Italianate mansion and square watchtower.
      box(0,h*.29,0,w*.78,h*.58,d*.65,cream);
      box(0,h*.59,0,w*.83,h*.04,d*.70,stone);
      box(w*.20,h*.68,-d*.10,w*.20,h*.25,d*.23,cream);
      roof(w*.20,h*.84,-d*.10,w*.25,h*.10,d*.28,stone);
      for(const x of [-.25,0,.25])for(const y of [.20,.43])box(x*w,y*h,d*.34,w*.09,h*.15,d*.02,dark);
      return true;
    }
    case 'new-hayward-japanese-gardens': {
      // Pond, arched bridge and clipped topiary around a small garden pavilion.
      box(0,h*.035,0,w*.92,h*.07,d*.90,green);
      box(0,h*.075,0,w*.42,h*.01,d*.46,glass);
      for(const x of [-.25,.25])box(x*w,h*.20,0,w*.04,h*.26,d*.07,red);
      box(0,h*.32,0,w*.52,h*.04,d*.07,red);
      for(const x of [-.35,.35])for(const z of [-.28,.28]){
        box(x*w,h*.15,z*d,w*.04,h*.20,d*.04,red);
        cyl(x*w,h*.28,z*d,w*.14,h*.10,d*.14,green);
      }
      for(const x of [-.12,.12])box(x*w,h*.25,-d*.34,w*.025,h*.35,d*.025,cream);
      roof(0,h*.48,-d*.34,w*.32,h*.14,d*.22,red);
      return true;
    }
    case 'new-mcconaghy-house': {
      // Stick-Eastlake farmhouse with contrasting trim and steep gables.
      box(0,h*.29,-d*.04,w*.70,h*.58,d*.62,cream);
      roof(0,h*.70,-d*.04,w*.76,h*.24,d*.68,dark);
      box(-w*.21,h*.35,d*.30,w*.22,h*.48,d*.10,stone);
      roof(-w*.21,h*.69,d*.30,w*.27,h*.22,d*.16,dark);
      for(const x of [-.26,0,.26])box(x*w,h*.32,d*.36,w*.07,h*.20,d*.02,red);
      for(const x of [-.30,.30])box(x*w,h*.16,-d*.37,w*.035,h*.25,d*.035,red);
      box(0,h*.30,-d*.37,w*.64,h*.035,d*.08,stone);
      return true;
    }
    case 'new-coyote-hills': {
      // Visitor center by low golden hills and tule reeds.
      box(0,h*.035,0,w*.92,h*.07,d*.90,green);
      box(-w*.10,h*.22,-d*.06,w*.57,h*.37,d*.48,stone);
      roof(-w*.10,h*.48,-d*.06,w*.62,h*.16,d*.53,red);
      box(-w*.10,h*.23,d*.19,w*.23,h*.20,d*.02,glass);
      dome(w*.30,h*.07,-d*.27,w*.30,h*.28,d*.26,gold);
      for(const z of [.22,.29,.36])for(const x of [.25,.34])
        box(x*w,h*.16,z*d,w*.018,h*.19,d*.018,stone);
      return true;
    }
    case 'new-don-edwards-visitor': {
      // Refuge headquarters beside marsh water, with binocular viewing platform.
      box(0,h*.035,0,w*.92,h*.07,d*.90,green);
      box(-w*.12,h*.24,-d*.14,w*.56,h*.41,d*.45,cream);
      roof(-w*.12,h*.52,-d*.14,w*.60,h*.15,d*.49,stone);
      box(-w*.12,h*.24,d*.09,w*.27,h*.18,d*.02,glass);
      box(w*.27,h*.10,d*.22,w*.22,h*.10,d*.28,stone);
      for(const x of [.20,.34])box(x*w,h*.23,d*.33,w*.025,h*.20,d*.025,cream);
      box(w*.27,h*.34,d*.33,w*.16,h*.03,d*.03,cream);
      box(0,h*.075,d*.37,w*.60,h*.01,d*.10,glass);
      return true;
    }
    case 'new-sunol-depot': {
      // A long Stick-style railroad depot with green roofs and projecting bay.
      box(0,h*.26,-d*.04,w*.84,h*.52,d*.46,cream);
      roof(-w*.20,h*.60,-d*.04,w*.47,h*.17,d*.50,green);
      roof(w*.23,h*.64,-d*.04,w*.40,h*.18,d*.52,green);
      box(-w*.10,h*.26,d*.23,w*.20,h*.35,d*.10,stone);
      for(const x of [-.18,-.10,-.02])box(x*w,h*.27,d*.29,w*.045,h*.18,d*.02,dark);
      for(const side of [-1,1])box(0,h*.035,side*d*.38,w*.90,h*.03,d*.035,dark);
      return true;
    }
    case 'new-fremont-central-pavilion': {
      // Small open-air stage beneath a roof, set into the park lawn.
      box(0,h*.04,0,w*.92,h*.08,d*.90,green);
      box(0,h*.12,-d*.06,w*.76,h*.16,d*.52,stone);
      for(const x of [-.32,.32])for(const z of [-.27,.17])box(x*w,h*.45,z*d,w*.04,h*.62,d*.04,cream);
      roof(0,h*.78,-d*.05,w*.82,h*.18,d*.58,cream);
      box(0,h*.34,-d*.30,w*.63,h*.39,d*.04,dark);
      return true;
    }
    default:return false;
  }
}
