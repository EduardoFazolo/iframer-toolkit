# WebGL Extensions List Spoofing

## Problem
We already spoof WebGL `VENDOR` (`"Intel Inc."`) and `RENDERER` (`"Intel Iris OpenGL Engine"`), but `gl.getSupportedExtensions()` still returns the real SwiftShader extension list. This is a contradiction — a real Intel Iris GPU supports a very different set of extensions than SwiftShader (Google's software renderer).

SwiftShader's extension list is well-known and used as a direct bot signal. Example: SwiftShader does NOT support `EXT_color_buffer_float`, `OES_texture_float_linear`, or `WEBGL_multi_draw` but a real GPU does.

## Solution
Spoof `getSupportedExtensions()` to return a realistic list matching the claimed Intel Iris GPU on macOS/Linux.

## Implementation

Add to `STEALTH_SCRIPT` in `stealth.ts`:

```js
const INTEL_IRIS_EXTENSIONS = [
  'ANGLE_instanced_arrays',
  'EXT_blend_minmax',
  'EXT_color_buffer_half_float',
  'EXT_disjoint_timer_query',
  'EXT_float_blend',
  'EXT_frag_depth',
  'EXT_shader_texture_lod',
  'EXT_texture_compression_bptc',
  'EXT_texture_compression_rgtc',
  'EXT_texture_filter_anisotropic',
  'EXT_sRGB',
  'KHR_parallel_shader_compile',
  'OES_element_index_uint',
  'OES_fbo_render_mipmap',
  'OES_standard_derivatives',
  'OES_texture_float',
  'OES_texture_float_linear',
  'OES_texture_half_float',
  'OES_texture_half_float_linear',
  'OES_vertex_array_object',
  'WEBGL_color_buffer_float',
  'WEBGL_compressed_texture_s3tc',
  'WEBGL_compressed_texture_s3tc_srgb',
  'WEBGL_debug_renderer_info',
  'WEBGL_debug_shaders',
  'WEBGL_depth_texture',
  'WEBGL_draw_buffers',
  'WEBGL_lose_context',
  'WEBGL_multi_draw',
];

const _getSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;
WebGLRenderingContext.prototype.getSupportedExtensions = function() {
  return INTEL_IRIS_EXTENSIONS;
};

if (typeof WebGL2RenderingContext !== 'undefined') {
  const INTEL_IRIS_EXTENSIONS_2 = [
    ...INTEL_IRIS_EXTENSIONS,
    'EXT_color_buffer_float',
    'EXT_texture_norm16',
    'OES_draw_buffers_indexed',
    'WEBGL_clip_cull_distance',
    'WEBGL_provoking_vertex',
  ];
  const _getSupportedExtensions2 = WebGL2RenderingContext.prototype.getSupportedExtensions;
  WebGL2RenderingContext.prototype.getSupportedExtensions = function() {
    return INTEL_IRIS_EXTENSIONS_2;
  };
}
```

Also spoof `getExtension()` to not return `null` for extensions in our fake list (otherwise detection scripts call `getExtension('EXT_color_buffer_float')` and get null despite us claiming it's supported):

```js
const _getExtension = WebGLRenderingContext.prototype.getExtension;
WebGLRenderingContext.prototype.getExtension = function(name) {
  return _getExtension.call(this, name); // real call first
  // If real call returns null but we claim to support it, return a stub
  // (advanced — implement if needed)
};
```

## Notes
- The extension list above is based on a real Intel Iris Plus (macOS Big Sur/Monterey). Should be updated if we switch to claiming a different GPU.
- If we change the platform claim (see `03-platform-consistency.md`), update this list to match the new GPU.
- The `WEBGL_debug_renderer_info` extension must remain in the list (it's what exposes VENDOR/RENDERER that we already spoof).

## Testing
Use https://browserleaks.com/webgl — compare the extension list before and after. Check that no "SwiftShader" extensions appear and no obviously missing extensions exist for the claimed GPU.

## Files to touch
- `src/lib/browser/stealth.ts` — add extension spoofing to `STEALTH_SCRIPT`
