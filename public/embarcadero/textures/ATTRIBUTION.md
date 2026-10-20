# Embarcadero generated texture sources

These original base-color and cutout textures were generated with the built-in
OpenAI image generator on 19 October 2026. No outside photograph was used as an
input. The game applies them to three-dimensional surfaces and supplies the
scene lighting separately. Generated geography is illustrative, not a survey.

| File | Size | Intended use and processing |
| --- | --- | --- |
| `facade.webp` | 1024 × 683 | Three-floor waterfront facade. Resized and encoded as WebP, quality 83; use as a single building front. |
| `asphalt.webp` | 768 × 768 | Repeatable road albedo. Resized, opposite-edge blended, WebP quality 82. |
| `paving.webp` | 768 × 768 | Repeatable sidewalk albedo. Cropped to a two-course repeat, resized, opposite-edge blended, WebP quality 82. |
| `palm-frond.png` | 1024 × 418 | One feather-palm frond, stem at left. Resized with transparency preserved; near-zero-alpha fringe removed, lossless PNG. |
| `palm-frond.webp` | 1024 × 418 | The same frond, WebP quality 88 with lossless alpha, used in the main game. |
| `shoreline.webp` | 1024 × 512 | Illustrative East Bay hills for a distant 3D surface. Resized, WebP quality 81. |

Both repeat textures were inspected as 2 × 2 tiles. The palm was inspected
against a light blue background and retains transparent gaps between leaves.

## Generation prompts

**Facade.** Use case: photorealistic-natural. Asset type: albedo texture for a real-time 3D game façade. Orthographic straight-on close-up of an early 20th-century San Francisco waterfront commercial building façade: warm pale buff stone and cream stucco, a repeatable orderly grid of tall recessed dark-glass sash windows with fine stone surrounds, subtle cornice details, varied believable stone and plaster surface wear. Fill the entire frame with the facade, crop so it can be repeated horizontally, no perspective convergence. Balanced soft overcast diffuse light; no strong shadows, no sunlight, no sky, no people, no cars, no writing, no signs, no watermark. Natural photographic materials, neither illustration nor abstract texture.

**Asphalt.** Use case: photorealistic-natural. Asset type: seamless albedo texture for a browser 3D driving game road surface. A flat, straight-down view of medium-gray fine-grained asphalt with subtle embedded aggregates and realistic slightly weathered variation, tightly fill the whole image. The texture must tile seamlessly in both horizontal and vertical directions. Neutral diffuse lighting, no baked directional shadows, no lane paint, no curbs, no oil spills, no large cracks, no signs, no text, no watermark.

**Paving.** Use case: photorealistic-natural. Asset type: seamless albedo texture for waterfront sidewalk in a 3D driving game. Orthographic straight-down close-up of natural light warm-gray/beige concrete sidewalk slabs, square and rectangular slabs in a simple subtle repeating bond, narrow fine dark joints and small pores. Tile seamlessly in both axes. Neutral diffuse light, no directional or contact shadows, no people, no objects, no text, no watermark.

**Palm frond.** Use case: photorealistic-natural. Asset type: transparent texture for one single 3D palm frond card in a real-time game. Botanical specimen, exactly ONE long feather-shaped date palm leaf viewed straight from above, its rigid stem begins at left-middle edge and arches gracefully toward a pointed tip at right-middle edge. A central thin green rib runs continuously left-to-right. Many narrow lance-shaped leaflets branch at alternating angles along both sides of that rib; leaflets fan outward and droop slightly like a palm feather. Fill most of the frame horizontally with some transparent margin. Isolated on a truly transparent background. Natural dark muted green color, diffuse neutral lighting, crisp cutout edges and actual gaps between leaflets; no trunk, no whole palm tree, no repeated separate leaves, no shadows, no text, no watermark.

**Shoreline.** Use case: photorealistic-natural. Asset type: a reusable distant hillside albedo texture to map onto actual 3D coastal hillside geometry in a video game. Orthographic distant Bay Area hillside with layers of muted olive-brown slopes and subtle blue atmospheric haze, very tiny light-colored low-rise East Bay houses sprinkled organically across the hill, sparse green oak trees, warm neutral colors. It fills the entire image edge to edge; no sky, no bay, no clouds, no roads, no buildings cut out separately, no text, no sun. Soft diffuse light, no baked directional shadows. Photorealistic geographic texture.
