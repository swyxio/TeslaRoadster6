# Fleet research and modeling contract

Researched 2026-10-17. The ambient roster covers **26 vehicle/platform families**, including historical and announced designs. The candidate branch adds six separate special vehicles for the Vault collection. “All models” means identifiable road-vehicle families, not every trim, year, sensor generation, regional homologation or laboratory chassis. Entries do not assert current sales or local service availability. This is a curated catalog, not a live product feed.

## Evidence and units

`shared/vehicles.ts` is the authoritative registry. Every entry includes source URLs, status and explicit estimation notes. Dimensions are meters; mass kilograms; speed meters/second; acceleration/braking meters/second²; steering radians. Width normally excludes mirrors; roof sensor equipment is additional visual geometry. Heights are representative body envelopes, not clearance guarantees.

**Every speed, acceleration, steering-angle and braking value is game tuning.** Equipment mass is unknown on most autonomy conversions; listed mass is an estimate, not a measured fleet curb weight. No tuning is a road-safety, collision or vehicle-performance prediction. No real autonomy software or remote-control integration is involved. Driving cars built without controls is a deliberate game fiction. The fictional Rocket interpretation of the next-generation Roadster starts with air-powered stunts; any vehicle can acquire a fictional retrofit kit in the game. Performance, repeated air jumps, tank behavior and game suction are arcade tuning, not manufacturer specifications.

Primary manufacturer/operator documents establish the families and visual references below. For Cruise's earliest platforms, original company pages were not recovered; direct interviews with founder Kyle Vogt provide first-person platform evidence. These exceptions are identified rather than presented as manufacturer specification sheets. No promotional artwork or downloadable vehicle meshes are bundled.

## Tesla: 11 families

| Registry ID | Design reference and game differentiation | Evidence / precision |
|---|---|---|
| `roadster-original` | Short open sports car; light and nimble; no jets | [Tesla Roadster service technical data](https://service.tesla.com/docs/Public/Roadster/ServiceManual/en-us/GUID-4E037ADB-D0F4-48A0-9261-1083193D4C1B.html): 3.946 m length, 2.351 m wheelbase, 1,235 kg curb mass. Body width estimated; published width includes mirrors. Height is laden. |
| `roadster` | Low next-generation sports silhouette; red hero with arcade thrusters and surface adhesion | [Tesla Roadster](https://www.tesla.com/roadster): design reference; page text extraction incomplete, so geometry/mass are estimates and no claimed manufacturer performance is copied. [Jalopnik’s reveal report](https://www.jalopnik.com/2288450/tesla-roadster-rereveal-new-design-production-plans-for-flying-car/) describes four rear, four corner lift, and two front-fender lateral ports; the model approximates their layout and visual activation. |
| `model-s` | Long low fastback | [Tesla Model S dimensions](https://www.tesla.com/ownersmanual/models/en_kr/GUID-91E5877F-3CD2-4B3B-B2B8-B5DB4A6C0A05.html): representative non-Plaid length 5.021 m, width 1.987 m, height 1.430 m, wheelbase 2.960 m, 2,070 kg. |
| `model-3` | Compact sports sedan; sharper steering than S | [Tesla Model 3 dimensions](https://www.tesla.com/ownersmanual/model3/en_ie/GUID-56562137-FC31-4110-A13C-9A9FC6657BF0.html): RWD/Long Range geometry; mass estimated. |
| `model-x` | Tall large SUV with falcon-door seam cues | [Tesla Model X dimensions](https://www.tesla.com/ownersmanual/modelx/en_kr/GUID-91E5877F-3CD2-4B3B-B2B8-B5DB4A6C0A05.html): AWD five-seat reference, 2,337 kg. Door animation is not implied. |
| `model-y` | Rounded crossover, lightbar cues | [Tesla Model Y](https://www.tesla.com/modely): family/design; representative game envelope and mass. |
| `model-y-l` | Longer six-seat crossover; longer turning radius | Same [Model Y page](https://www.tesla.com/modely) explicitly identifies Y L. Length, height and mass rounded from 195.6 in, 65.7 in and 4,612 lb; width/wheelbase estimated. |
| `cybertruck` | Angular metal wedge, bed and lightbar; heavy, rear steer | [Tesla manual filed with NHTSA](https://static.nhtsa.gov/odi/tsbs/2024/MC-11008782-0001.pdf) supplies geometry; medium ride height. Mass estimated. [Tesla investor update](https://ir.tesla.com/_flysystem/s3/sec/000162828025002993/tsla-20250129-gen.pdf) confirms rear-wheel steering and steer-by-wire; game steering gain is simplified. |
| `cybercab` | Gold two-seat coupe with covered-wheel / butterfly-door cues | [Tesla Cybercab FAQ](https://www.tesla.com/support/robotaxi/cybercab) and [rider guide exterior](https://www.tesla.com/robotaxi/riderguides/cybercab/en_us/GUID-669E83C2-E7DE-40F4-9DBD-C9A32E7F6DFF.html) establish design, no steering wheel/pedals. Full mass/exterior geometry estimated. |
| `tesla-semi` | Tall aerodynamic center-cab tractor; very heavy, slow turning | [Tesla Semi](https://www.tesla.com/semi): design family. Tractor envelope/mass estimated; no trailer/cargo simulation. Gross combination ratings must never be substituted for tractor mass. |
| `robovan` | Low-wheel-visibility streamlined shuttle/bus | [Tesla Robotaxi fleet page](https://www.tesla.com/robotaxi): announced Robovan identity. Geometry, mass and handling estimated; concept presence is not production evidence. |

Roadster 1.5/2.0/2.5, Plaid, Performance, battery trims and ordinary facelift years are represented within their family rather than duplicate cars. Y L is separate because its longer body is a meaningful silhouette/handling difference. Cyberquad toys, Optimus, third-party conversions and speculative unnamed vehicles are outside the road-vehicle fleet scope.

## Waymo: 9 platforms

| Registry ID | Visual / handling reference | Primary evidence |
|---|---|---|
| `waymo-prius` | Historical wedge hatch, roof sensor tower | [Waymo history](https://blog.waymo.com/about/) identifies the original Prius fleet. |
| `waymo-lexus` | Historical Lexus RX SUV, early roof sensor assembly | [Waymo testing history](https://waymo.com/blog/2020/09/the-waymo-drivers-training-regime/) identifies Lexus 450 SUVs; [2016 account](https://waymo.com/blog/2016/12/why-were-aiming-for-fully-self-driving/) explains early Lexus testing. |
| `waymo-firefly` | Tiny rounded two-seat pod and roof dome; slow and agile | [Waymo Firefly design retrospective](https://waymo.com/blog/2017/06/from-post-it-note-to-prototype-journey/): prototype, no wheel/pedals, retired; 25 mph limit informs game maximum. |
| `waymo-pacifica` | Long minivan with prominent sensor roof | [Waymo platform evolution](https://waymo.com/blog/2019/09/waymo-iaa-frankfurt-2019/) identifies Chrysler Pacifica and fourth-generation integration. |
| `waymo-ipace` | White Jaguar I-PACE crossover, roof and perimeter sensors | [Waymo first responder reference](https://community.waymo.com/firstresponders/) identifies I-PACE and supplies operator visual reference. |
| `waymo-ojai` | Tall white purpose-built Zeekr/Ojai minivan | [Waymo's Ojai rider announcement](https://community.waymo.com/blog/2026/05/welcoming-riders-in-the-ojai/) establishes Ojai service platform. One entry covers this lineage rather than calling Zeekr and Ojai separate makes of Waymo car. |
| `waymo-ioniq5` | Angular IONIQ 5 crossover, pixel-light cues, roof sensors | [Waymo–Hyundai agreement](https://waymo.com/blog/2024/10/waymo-and-hyundai-enter-partnership/) establishes sixth-generation integration; [first responder reference](https://community.waymo.com/firstresponders/) lists the platform. No current city availability claim. |
| `waymo-peterbilt` | Conventional long-nose test tractor, rooftop/perimeter equipment | [Waymo trucking hardware account](https://waymo.com/blog/2021/12/designed-to-deliver/) confirms Peterbilt test trucks. Exact chassis variant not verified, so entry is family-level. |
| `waymo-cascadia` | Conventional aerodynamic Freightliner tractor | Same [Waymo trucking account](https://waymo.com/blog/2021/12/designed-to-deliver/) identifies redundant Cascadia Freightliners. |

All autonomy-equipped Waymo dimensions/masses are estimates. Stock OEM curb masses do not establish modified test-fleet masses. Truck entries are historical test-platform representations and are tractors without trailers. Sensor-generation revisions are visual alternatives within each family, not extra model IDs.

## Cruise: 4 platforms

| Registry ID | Visual / handling reference | Evidence |
|---|---|---|
| `cruise-rp1` | Dark Audi A4/S4-family sedan with early roof retrofit | [2014 direct Kyle Vogt interview](https://techcrunch.com/2014/06/23/cruise/) confirms A4/S4 support. This is first-person interview evidence, not a surviving Cruise spec sheet. A4 and S4 are one body family here. |
| `cruise-leaf` | Early Nissan LEAF hatchback test vehicle with roof sensors | [2017 direct Kyle Vogt interview](https://www.forbes.com/sites/alanohnsman/2017/03/13/cruises-kyle-vogt-says-gm-will-deploy-automated-rideshare-cars-very-quickly/) confirms the earlier LEAF test vehicles. Same first-person evidence limitation. |
| `cruise-bolt` | Compact Bolt hatch, white/orange fleet cues, roof sensors | [GM investor presentation](https://investor.gm.com/static-files/6eb181e4-612e-488d-b73c-2d632e3a0949) supplies vehicle imagery; founder interview also distinguishes Bolt from LEAF. |
| `cruise-origin` | Rectangular passenger pod, paired sliding-door cues, corner sensors | [GM technology report](https://investor.gm.com/static-files/994e9842-0787-4aa5-ab72-4b49bdbe5a9e) establishes purpose-built Origin without manual controls; [Cruise engineering article](https://medium.com/cruise/cruise-embedded-systems-articulating-radars-7cae24642930) describes articulating Origin sensors. |

All Cruise geometry, equipment mass and steering numbers are game estimates. Historical labels avoid implying present commercial robotaxi service. Origin is retained as a prototype, not a current production claim. A [GM 2024 investor update](https://investor.gm.com/static-files/76b47dc0-4904-42cd-b4b7-58dd54d8499e) discussed shifting from Origin toward a next-generation Bolt: that plan does not establish another completed distinct fleet platform.

## Zoox: 2 platforms

| Registry ID | Visual / handling reference | Primary evidence |
|---|---|---|
| `zoox` | Mint symmetric carriage pod, four corner sensors, four-wheel steering | [Know Your Ride](https://zoox.com/know-your-ride) establishes bidirectional design and four-wheel steering. [Operator vehicle brochure](https://zoox.com/common/files/galcpo3qq8khj63lhpqhiw-202507-zoox-vehicle-brochure-pdf.pdf) is a visual reference; PDF text extraction failed, so numeric values remain explicitly estimates. |
| `zoox-highlander` | Dark Toyota Highlander Hybrid SUV with roof sensor module | [Zoox testing-fleet account](https://zoox.com/journal/autonomous-zoox-testing-vehicle) explains the 2023 roof module revision and supervised mapping/testing role; [2026 operator testing-fleet protocol](https://zoox.com/common/files/global-202604-zoox-leip-testing-fleet.pdf) identifies Highlander Hybrids. |

[Zoox's development retrospective](https://zoox.com/journal/10-years-of-building-zoox) shows successive internal proof-of-concept chassis. It does not establish a reliable complete publicly named VH model roster or published dimensions. These iterations are documented research scope, not invented additional production models. [LabBot](https://zoox.com/journal/labbot) is a laboratory hardware-in-the-loop system and is excluded from drivable vehicles.

## The Vault: 6 special vehicles

`LUXURY_CATALOG` in `shared/luxury.ts` defines the collection and prices; `LUXURY_VEHICLE_IDS` derives from it, while `VEHICLE_IDS` remains the 26-model ambient roster. The six IDs must stay out of ambient parked, NPC and highway traffic and free fleet selection. Their intended path is purchase at the Vault followed by owner collection at the Vault or a physical workshop. Persistent wallet and ownership flow remain in progress; visual and performance verification are pending. See [LUXURY_SHOWROOM.md](LUXURY_SHOWROOM.md).

| Registry ID | Source-based geometry and explicit estimates |
|---|---|
| `ducati-panigale-v4` | 2025 Panigale V4: 1.485 m wheelbase from [Ducati](https://media.ducati.com/dam/MY25_Panigale_V4_EU_UC662332.pdf); the game body envelope and mass are estimates. |
| `kawasaki-ninja-h2-carbon` | 2019 Ninja H2 Carbon: 2.085 × 0.770 × 1.125 m, 1.455 m wheelbase from [Kawasaki](https://global.kawasaki.com/en/corp/newsroom/news/detail/?f=20180810_1441); game mass includes an estimated rider. |
| `lamborghini-temerario` | 4.706 × 1.996 × 1.201 m, 2.658 m wheelbase from the [Lamborghini brochure](https://www.lamborghini.com/original/DAM/lamborghini/0_facelift_2025/model_details_new/temerario_2/brochure_2026/Lamborghini%20Temerario_DIGITAL_BROCHURE_2026_EN.pdf); game mass estimated. |
| `lamborghini-revuelto` | 4.947 × 2.033 × 1.160 m, 2.779 m wheelbase from the [Lamborghini brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/revuelto/2024/brochure/REVUELTO_DIGITAL_BROCHURE_CN_2024.pdf); game mass estimated. |
| `bugatti-chiron` | 4.544 × 2.038 × 1.212 m, 2.711 m wheelbase from [Bugatti](https://newsroom.bugatti.com/api/en/press-releases/pdf/bugatti-eb110-vs-chiron-super-sports-and-hyper-sports-cars-compared); game mass and durability tuning estimated. |
| `bugatti-tourbillon` | 4.671 × 2.051 × 1.189 m, 2.740 m wheelbase from the [Bugatti launch specifications](https://worldpremiere.bugatti.com/fr); source measurements need re-verification and game mass is estimated. |

The car widths exclude mirrors. Bike envelopes exclude the rider and fictional Rocket hardware. All six use arcade handling and damage tuning rather than manufacturer performance values. Their original procedural models share cached geometry; bikes have two wheels and an occupant-dependent rider.

## Contributor boundaries and gameplay intent

Use these original low-poly interpretations to make weight and silhouette immediately legible: light hatchbacks turn eagerly, long vans sweep wide, trucks accelerate slowly and transfer more collision momentum, and the hero Roadster remains fastest with jets. Cybertruck and Zoox rear steering should make tight low-speed turns noticeably easier. Do not claim a full suspension/tire or autonomy simulator.

Renderers consume registry dimensions/shape/color/sensorRig; simulation owns physical behavior. A replacement model must retain the registry ID and meter scale; no inferred mass from triangle count. Numeric estimates may be improved only with a cited configuration and explicit contract review. Source evidence and gameplay tuning must remain separate even when numbers happen to match.

“Poly Ave” works as a fictional street/district name; “Poly AV” also reads as low-poly autonomous vehicles. Use affectionate Bay Area wordplay such as “many lanes, open relationships” without making consent or polyamory the butt of a hostile joke. Neither phrase implies operator affiliation.
