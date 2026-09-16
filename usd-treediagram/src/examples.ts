/** Starting points, one per shape the docs keep needing. */

export interface Example {
  name: string
  source: string
}

export const EXAMPLES: Example[] = [
  {
    name: 'Component asset',
    source: `# A component asset, as the asset's root layer composes it
chair  Xform  kind=component  {lod=high}
  geo  Scope
    render  Scope
      seat  Mesh
      legs  Mesh
    proxy  Scope  closed
  mtl  Scope
    wood  Material  closed
    metal  Material  closed
`,
  },
  {
    name: 'Shot stage',
    source: `# The top of a shot, after layout, anim and lighting are sublayered in
World  Xform  kind=assembly
  chars  Scope  kind=group
    hero  Xform  kind=component  +ref +payload  selected  "the published asset"
      geo  Scope  closed
    crowd  PointInstancer  +instance
  sets  Scope  kind=group
    kitchen  Xform  kind=assembly  +ref +unloaded  "payload not loaded"
  cam  Scope
    shotCam  Camera
  lights  Scope
    key  RectLight
    env  DomeLight_1
  ... 4 more not shown
`,
  },
  {
    name: 'Composition arcs',
    source: `# Every flag the renderer knows
root  Xform
  referenced  Xform  +ref
  payloaded  Xform  +payload
  unloaded  Xform  +unloaded
  inherits  Xform  +inherit
  specializes  Xform  +specialize
  instanced  Xform  +instance
  variant  Xform  {shading=red}
  variants  Xform  {shading=red, lod=low}
  _class_Chair  Xform  class
  overridden  over
  disabled  Xform  inactive
  selectedPrim  Xform  *
`,
  },
]
