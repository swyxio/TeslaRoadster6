# Roadster model attribution

“Tesla Roadster 2020” by **metarex.4d**, licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). [Artist’s original Sketchfab listing](https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8). The artist describes this as their freely downloadable and riggable model; the listing reports 608.9k triangles.

We retrieved the 608,769-triangle GLB from [this public mirror](https://github.com/stevenzhang070302/tesla-roadster-webgi/blob/907561805d936d64b3cb834b580e81007f6d987a/assets/tesla.glb), which also [credits the creator and license](https://github.com/stevenzhang070302/tesla-roadster-webgi/blob/907561805d936d64b3cb834b580e81007f6d987a/Readme.md). Original GLB SHA-256: `9ca3f8be562d47e08c80770f094a5dcf30b65c697951ddd60476dfb25588acc3`.

Changes: the geometry was simplified and compatible meshes were joined, while four independent wheel pivots remain; The intermediate geometry-optimized model contains 123,141 triangles and 56 primitives. The demo applies different paint and glass, rescales and reorients the model, and adds fictional rocket nozzles. Intermediate GLB SHA-256: `318249e225e788f8b99ec9f147f65cf1b2ef667fa8b5e943a70dd93970a64a74`.

The intermediate can be rebuilt from the exact original with `optimize.mjs` in this directory. It requires Node.js, Three.js 0.186.0, `@gltf-transform/core`, `@gltf-transform/extensions` and `@gltf-transform/functions` 4.5.1, `draco3dgltf` 1.5.9, and `meshoptimizer` 1.3.0. Run `node optimize.mjs source.glb roadster.glb` in an environment with those packages installed. The original was a WebGI export; the optimizer intentionally removes unused WebGI viewer metadata and preserves supported glTF material extensions.

The Draco decoder distributed alongside comes from Three.js and Google Draco. Three.js is [MIT licensed](https://github.com/mrdoob/three.js/blob/dev/LICENSE), and Draco is [Apache 2.0 licensed](https://github.com/google/draco/blob/main/LICENSE).

The model depicts a Tesla vehicle. This unofficial fan demo is not affiliated with Tesla.

The shipped `roadster.glb` is the texture-compressed asset, SHA-256 `e63040bb6f8f2d556ab20b78cc0acdd7674c9061a4c976868f8c957cde55bc40`. Starting from the geometry-optimized GLB above, unused original paint normal texture was removed because the demo substitutes its own paint material. The remaining 1024-pixel textures were reduced to 512 pixels, converted to WebP (lossless for normal and metallic/roughness maps; quality 85 for base color maps), and saved with `EXT_texture_webp`. Geometry remains 123,128 triangles in 56 primitives, with all four named wheel pivots. Processing: `node compress-textures.mjs roadster-optimized2.glb roadster.glb`, with the same tool versions above and `sharp` 0.34.5.
