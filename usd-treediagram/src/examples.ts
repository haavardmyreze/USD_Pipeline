/** Starting points, one per shape the docs keep needing. */

export interface Example {
  name: string
  source: string
}

export const EXAMPLES: Example[] = [
  {
    name: 'Nested instancing',
    source: `# Point instancing at set level, and again inside the asset
/
  World  Xform  kind=Assembly
    Environment  Scope
      Houses  PointInstancer  "Set level instancing"
        Prototypes  Scope
          House  Xform  kind=Component  "Self-Contained Asset"
            Geo  Scope
              PointInstancer  PointInstancer  "Asset level instancing"
                Prototypes  Scope
                  PlankA  Xform  kind=SubComponent  closed
                  PlankB  Xform  kind=SubComponent  closed
                  Bolt  Xform  kind=SubComponent  closed
                Base  Mesh
                Door  Mesh
              Mtl  Scope  closed
                Metal  Material  closed
                PaintedWood  Material  closed
      Landscape  Xform  kind=Component
        Geo  Scope
          Mesh  Mesh
        Mtl  Scope
          Landscape  Material  closed
`,
  },
  {
    name: 'Shot scene',
    source: `# A shot: referenced assets, lights, camera and render settings
World  Xform  kind=assembly
  Characters  Scope
    CharBob  Xform  kind=component  +ref
      Mtl  Scope
        Body  Material  +inherit  closed
        Head  Material  +inherit  closed
        Arms  Material  +inherit  closed
      geo  Scope
        Body  Mesh
        Head  Mesh
        Arms  Mesh
  Lighting  Scope
    Skylight  Xform
      sun  DistantLight
      sky  KarmaSkyDomeLight
  Environment  Scope
    EnvTerrain  Xform  kind=component  +ref
      mesh_0  Mesh
  Props  Scope
    PropSunglasses  Xform  kind=component  +ref
      geo  Scope
        Sunglasses  Mesh
      Mtl  Scope
        Sunglasses  Material  +inherit  closed
  Cameras  Scope
    CamA  Camera
Render  Scope
  karmarendersettings  RenderSettings
    Products  Scope
      renderproduct  RenderProduct
    Vars  Scope
      beauty  RenderVar
      CryptoObject  RenderVar
      depth  RenderVar
      N  RenderVar
      P  RenderVar
`,
  },
  {
    name: 'Kilo 0010',
    source: `# Char Bob
char-bob_model.usdc asset
char-bob_lookdev.usda asset
char-bob.usda asset
char-bob.usda -> char-bob_model.usdc
char-bob.usda -> char-bob_lookdev.usda

# Env Tree
env-tree_model.usdc asset
env-tree_lookdev.usda asset
env-tree.usda asset

env-tree.usda -> env-tree_model.usdc
env-tree.usda -> env-tree_lookdev.usda

# Set Landscape
set-landscape_terrain.usdc set
set-landscape_dressing.usda set
set-landscape_lighting.usda set
set-landscape.usda set

set-landscape_dressing.usda -> env-tree.usda reference

set-landscape.usda -> set-landscape_terrain.usdc
set-landscape.usda -> set-landscape_dressing.usda
set-landscape.usda -> set-landscape_lighting.usda

# Kilo 0010
kilo-0010_layout.usda shot
kilo-0010.usda shot
kilo-0010_lighting.usda shot

kilo-0010_layout.usda -> char-bob.usda reference

kilo-0010.usda -> set-landscape.usda sublayer
kilo-0010.usda -> kilo-0010_lighting.usda sublayer
kilo-0010.usda -> kilo-0010_layout.usda sublayer
`,
  },
]
