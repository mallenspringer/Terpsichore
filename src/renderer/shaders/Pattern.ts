export const PatternWGSL = `
struct PatternUniforms {
  countX: f32,
  countY: f32,
  spacingX: f32,
  spacingY: f32,
  offsetX: f32,
  offsetY: f32,
  alternateMirrorX: u32,
  alternateMirrorY: u32,
  mode: u32,             // 0: grid, 1: radial
  radialRings: f32,
  radialSegments: f32,
  tileRotation: f32,     // rotation per tile index
  jitter: f32,           // position jitter amount
  distortAmount: f32,    // UV displacement intensity
  hasDistortTex: u32,    // 0: false, 1: true
  pad0: f32,
};

@group(0) @binding(0) var<uniform> uniforms : PatternUniforms;
@group(0) @binding(1) var mainSampler: sampler;
@group(0) @binding(2) var mainTexture: texture_2d<f32>;
@group(0) @binding(3) var distortTexture: texture_2d<f32>;

const PI: f32 = 3.14159265359;

fn hash22(p: vec2<f32>) -> vec2<f32> {
  var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    var p = uv;

    // Apply UV Texture Distortion if connected
    if (uniforms.hasDistortTex == 1u && uniforms.distortAmount != 0.0) {
      let dSample = textureSample(distortTexture, mainSampler, uv);
      let warp = (dSample.rg - 0.5) * uniforms.distortAmount;
      p = p + warp;
    }

    var cellX = 0.0;
    var cellY = 0.0;
    var localUV = p;

    if (uniforms.mode == 0u) {
      // GRID MODE
      p.x = p.x * uniforms.countX + (p.y * uniforms.offsetX);
      p.y = p.y * uniforms.countY + (p.x * uniforms.offsetY);

      cellX = floor(p.x);
      cellY = floor(p.y);
      localUV = fract(p);

      // Tile Jitter
      if (uniforms.jitter > 0.0) {
        let jOff = (hash22(vec2<f32>(cellX, cellY)) - 0.5) * uniforms.jitter;
        localUV = localUV + jOff;
      }

      // Alternate Mirroring
      if (uniforms.alternateMirrorX == 1u && u32(abs(cellX)) % 2u == 1u) {
        localUV.x = 1.0 - localUV.x;
      }
      if (uniforms.alternateMirrorY == 1u && u32(abs(cellY)) % 2u == 1u) {
        localUV.y = 1.0 - localUV.y;
      }
    } else {
      // RADIAL CONCENTRIC MODE
      let centerOffset = p - vec2<f32>(0.5 + uniforms.offsetX, 0.5 + uniforms.offsetY);
      let radius = length(centerOffset) * 2.0;
      var angle = atan2(centerOffset.y, centerOffset.x);
      let normAngle = (angle / (2.0 * PI)) + 0.5;

      let rings = max(uniforms.radialRings, 1.0);
      let segs = max(uniforms.radialSegments, 1.0);

      cellY = floor(radius * rings);
      cellX = floor(normAngle * segs);

      localUV = vec2<f32>(fract(normAngle * segs), fract(radius * rings));

      // Radial Jitter
      if (uniforms.jitter > 0.0) {
        let jOff = (hash22(vec2<f32>(cellX, cellY)) - 0.5) * uniforms.jitter;
        localUV = localUV + jOff;
      }

      // Mirroring in radial coordinates
      if (uniforms.alternateMirrorX == 1u && u32(abs(cellX)) % 2u == 1u) {
        localUV.x = 1.0 - localUV.x;
      }
      if (uniforms.alternateMirrorY == 1u && u32(abs(cellY)) % 2u == 1u) {
        localUV.y = 1.0 - localUV.y;
      }
    }

    // Per-Tile Incremental Rotation
    if (uniforms.tileRotation != 0.0) {
      let tileIndex = cellX + cellY * 13.0;
      let rotAngle = uniforms.tileRotation * tileIndex;
      let c = cos(rotAngle);
      let s = sin(rotAngle);
      let centered = localUV - 0.5;
      localUV = vec2<f32>(
        centered.x * c - centered.y * s + 0.5,
        centered.x * s + centered.y * c + 0.5
      );
    }

    // Spacing (squeeze the UVs)
    let sx = 1.0 + uniforms.spacingX;
    let sy = 1.0 + uniforms.spacingY;
    localUV = (localUV - 0.5) * vec2<f32>(sx, sy) + 0.5;

    // Mask for spacing / borders
    var mask = 1.0;
    if (localUV.x < 0.0 || localUV.x > 1.0 || localUV.y < 0.0 || localUV.y > 1.0) {
      mask = 0.0;
    }

    let color = textureSample(mainTexture, mainSampler, localUV);
    return color * mask;
}
`;
