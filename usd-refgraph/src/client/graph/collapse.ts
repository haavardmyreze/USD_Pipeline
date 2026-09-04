/**
 * Reduce the graph to assembly files only.
 *
 * Assemblies rarely point at each other directly — a shot root subLayers its
 * layout block, and *that* block references the asset assembly. So simply
 * hiding the blocks would leave a pile of disconnected files. Instead each
 * chain of blocks between two assemblies collapses into one arc, and the arc
 * remembers what it travelled through.
 *
 * What is left is the dependency graph a supervisor actually wants: which
 * shots use which sets, and which assets those pull in.
 */

import type { Graph, GraphEdge, GraphNode } from '@shared/types'

export function collapseToAssemblies(graph: Graph): Graph {
  const keep = new Set(
    graph.nodes.filter((node) => node.role === 'assembly').map((node) => node.id),
  )
  // Always keep the file the user opened, even when they opened a block
  // directly — otherwise the view would have nothing to hang off.
  keep.add(graph.rootId)

  // The collapsed graph drops the block nodes, so an arc has to carry their
  // names rather than their ids — nothing downstream could resolve the ids.
  const nameOf = new Map(graph.nodes.map((node) => [node.id, node.name]))

  const outgoing = new Map<string, GraphEdge[]>()
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from)
    if (list) list.push(edge)
    else outgoing.set(edge.from, [edge])
  }

  const edges: GraphEdge[] = []
  const seen = new Set<string>()

  for (const startId of keep) {
    // Walk outwards, passing straight through anything that is not kept.
    const queue: { id: string; via: string[] }[] = [{ id: startId, via: [] }]
    const visited = new Set<string>([startId])

    while (queue.length) {
      const current = queue.shift()!
      for (const edge of outgoing.get(current.id) ?? []) {
        if (keep.has(edge.to)) {
          // The last arc in the chain is the one that actually pulls the
          // assembly in, so it names the relationship.
          const key = `${startId}>${edge.to}>${edge.kind}`
          if (seen.has(key)) continue
          seen.add(key)
          edges.push({
            ...edge,
            id: `collapsed-${edges.length}`,
            from: startId,
            ...(current.via.length ? { via: current.via } : {}),
          })
          continue
        }
        if (visited.has(edge.to)) continue
        visited.add(edge.to)
        queue.push({
          id: edge.to,
          via: [...current.via, nameOf.get(edge.to) ?? edge.to],
        })
      }
    }
  }

  const nodes = graph.nodes.filter((node) => keep.has(node.id))
  return { ...graph, nodes, edges, stats: recount(graph, nodes, edges) }
}

/** Stats describing the collapsed view rather than the whole crawl. */
function recount(
  graph: Graph,
  nodes: GraphNode[],
  edges: GraphEdge[],
): Graph['stats'] {
  const byArc = { ...graph.stats.byArc }
  for (const kind of Object.keys(byArc) as (keyof typeof byArc)[]) byArc[kind] = 0
  for (const edge of edges) byArc[edge.kind] = (byArc[edge.kind] ?? 0) + 1

  return {
    ...graph.stats,
    layers: nodes.filter((n) => n.kind === 'layer').length,
    assets: nodes.filter((n) => n.kind === 'asset').length,
    missing: nodes.filter((n) => !n.exists && !n.template).length,
    edges: edges.length,
    totalBytes: nodes.reduce((sum, n) => sum + (n.size ?? 0), 0),
    byArc,
  }
}
