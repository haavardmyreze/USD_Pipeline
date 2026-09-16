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
]
