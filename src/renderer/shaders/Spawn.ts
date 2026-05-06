export const SpawnVertexWGSL = `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) instanceIndex: u32,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex : u32, @builtin(instance_index) instanceIndex : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );

  var uv = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(2.0, 1.0),
    vec2<f32>(0.0, -1.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = uv[vertexIndex];
  output.instanceIndex = instanceIndex;
  return output;
}
`;

export const SpawnWGSL = `
struct GlobalUniforms {
  aspect: f32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
};

struct InstanceData {
  pos: vec2<f32>,
  scale: f32,
  rotation: f32,
  opacity: f32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
};

@group(0) @binding(0) var<storage, read> allInstances: array<InstanceData>;
@group(0) @binding(1) var<uniform> globals: GlobalUniforms;
@group(0) @binding(2) var sourceTexture: texture_2d<f32>;
@group(0) @binding(3) var sourceSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) instanceIndex: u32,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let instance = allInstances[in.instanceIndex];
  var uv = in.uv;
  
  // 1. Center the UVs (-0.5 to 0.5)
  var p = uv - 0.5;
  
  // 2. Apply Aspect Correction
  p.x = p.x * globals.aspect;

  // 3. Translation
  p.x = p.x - instance.pos.x * globals.aspect;
  p.y = p.y - instance.pos.y;

  // 4. Scale
  p = p / instance.scale;

  // 5. Rotation
  let c = cos(-instance.rotation);
  let s = sin(-instance.rotation);
  p = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);

  // 6. Restore Aspect and Un-center
  p.x = p.x / globals.aspect;
  let final_uv = p + 0.5;

  // 7. Sample
  let color = textureSample(sourceTexture, sourceSampler, final_uv);

  // 8. Bounds Check
  let mask = step(0.0, final_uv.x) * step(final_uv.x, 1.0) * 
             step(0.0, final_uv.y) * step(final_uv.y, 1.0);

  return vec4<f32>(color.rgb, color.a * instance.opacity * mask);
}
`;
