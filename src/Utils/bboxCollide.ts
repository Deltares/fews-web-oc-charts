import { quadtree, type QuadtreeInternalNode, type QuadtreeLeaf } from 'd3-quadtree'

type BoundingBox = number[][]

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  index: number
}

interface CornerNode {
  node: Node
  x: number
  y: number
  vx: number
  vy: number
}

type Quad = (QuadtreeInternalNode<CornerNode> | QuadtreeLeaf<CornerNode>) & { bb?: BoundingBox }

type BoundingBoxAccessor<NodeType extends Node> = (
  node: NodeType,
  index: number,
  nodes: NodeType[],
) => BoundingBox

interface BBoxForce<NodeType extends Node> {
  (alpha: number): void
  initialize(nodes: NodeType[]): void
  iterations(): number
  iterations(value: number): BBoxForce<NodeType>
  strength(): number
  strength(value: number): BBoxForce<NodeType>
  bbox(): BoundingBox | BoundingBoxAccessor<NodeType>
  bbox(value: BoundingBox | BoundingBoxAccessor<NodeType>): BBoxForce<NodeType>
}

function x(d: CornerNode): number {
  return d.x + d.vx
}

function y(d: CornerNode): number {
  return d.y + d.vy
}

function constant(c: BoundingBox): () => BoundingBox {
  return function (): BoundingBox {
    return c
  }
}

function bbLength(bb: BoundingBox, heightWidth: number): number {
  return bb[1][heightWidth] - bb[0][heightWidth]
}

export function bboxCollide<NodeType extends Node = Node>(
  bbox: BoundingBox | BoundingBoxAccessor<NodeType>,
): BBoxForce<NodeType> {
  let nodes: NodeType[] = [],
    boundingBoxes: BoundingBox[],
    strength = 0.05,
    iterations = 1

  if (typeof bbox !== 'function') {
    bbox = constant(
      bbox ?? [
        [0, 0],
        [1, 1],
      ],
    )
  }
  const bboxAccessor = bbox

  function constructCornerNodes(): CornerNode[] {
    const cornerNodes: CornerNode[] = []
    nodes.forEach(function (d, j) {
      cornerNodes.push(
        {
          node: d,
          vx: d.vx,
          vy: d.vy,
          x: d.x + (boundingBoxes[j][1][0] + boundingBoxes[j][0][0]) / 2,
          y: d.y + (boundingBoxes[j][0][1] + boundingBoxes[j][1][1]) / 2,
        },
        {
          node: d,
          vx: d.vx,
          vy: d.vy,
          x: d.x + boundingBoxes[j][0][0],
          y: d.y + boundingBoxes[j][0][1],
        },
        {
          node: d,
          vx: d.vx,
          vy: d.vy,
          x: d.x + boundingBoxes[j][0][0],
          y: d.y + boundingBoxes[j][1][1],
        },
        {
          node: d,
          vx: d.vx,
          vy: d.vy,
          x: d.x + boundingBoxes[j][1][0],
          y: d.y + boundingBoxes[j][0][1],
        },
        {
          node: d,
          vx: d.vx,
          vy: d.vy,
          x: d.x + boundingBoxes[j][1][0],
          y: d.y + boundingBoxes[j][1][1],
        },
      )
    })
    return cornerNodes
  }

  function force() {
    let i: number,
      tree,
      node: NodeType,
      xi: number,
      yi: number,
      bbi: BoundingBox,
      nx1: number,
      ny1: number,
      nx2: number,
      ny2: number

    const cornerNodes = constructCornerNodes()
    const cn = cornerNodes.length

    let nodeI: number
    for (let k = 0; k < iterations; ++k) {
      tree = quadtree(cornerNodes, x, y).visitAfter(prepareCorners)

      for (i = 0; i < cn; ++i) {
        nodeI = Math.trunc(i / 5)
        node = nodes[nodeI]
        bbi = boundingBoxes[nodeI]
        xi = node.x + node.vx
        yi = node.y + node.vy
        nx1 = xi + bbi[0][0]
        ny1 = yi + bbi[0][1]
        nx2 = xi + bbi[1][0]
        ny2 = yi + bbi[1][1]
        tree.visit(apply)
      }
    }

    function applyCollision(data: CornerNode) {
      if (data.node.index === nodeI) return

      const bWidth = bbLength(bbi, 0)
      const bHeight = bbLength(bbi, 1)
      const dataNode = data.node
      const bbj = boundingBoxes[dataNode.index]
      const dnx1 = dataNode.x + dataNode.vx + bbj[0][0]
      const dny1 = dataNode.y + dataNode.vy + bbj[0][1]
      const dnx2 = dataNode.x + dataNode.vx + bbj[1][0]
      const dny2 = dataNode.y + dataNode.vy + bbj[1][1]
      const dWidth = bbLength(bbj, 0)
      const dHeight = bbLength(bbj, 1)

      if (!(nx1 <= dnx2 && dnx1 <= nx2 && ny1 <= dny2 && dny1 <= ny2)) return

      const xSize = [
        Math.min.apply(null, [dnx1, dnx2, nx1, nx2]),
        Math.max.apply(null, [dnx1, dnx2, nx1, nx2]),
      ]
      const ySize = [
        Math.min.apply(null, [dny1, dny2, ny1, ny2]),
        Math.max.apply(null, [dny1, dny2, ny1, ny2]),
      ]

      const xOverlap = bWidth + dWidth - (xSize[1] - xSize[0])
      const yOverlap = bHeight + dHeight - (ySize[1] - ySize[0])

      const xBPush = xOverlap * strength * Math.min(0.5, yOverlap / bHeight)
      const yBPush = yOverlap * strength * Math.min(0.5, xOverlap / bWidth)
      const xDPush = xOverlap * strength * Math.min(0.5, yOverlap / dHeight)
      const yDPush = yOverlap * strength * Math.min(0.5, xOverlap / dWidth)

      if ((nx1 + nx2) / 2 < (dnx1 + dnx2) / 2) {
        node.vx -= xBPush
        dataNode.vx += xDPush
      } else {
        node.vx += xBPush
        dataNode.vx -= xDPush
      }
      if ((ny1 + ny2) / 2 < (dny1 + dny2) / 2) {
        node.vy -= yBPush
        dataNode.vy += yDPush
      } else {
        node.vy += yBPush
        dataNode.vy -= yDPush
      }
    }

    function apply(quad: Quad, x0: number, y0: number, x1: number, y1: number): void | boolean {
      const data = 'data' in quad ? quad.data : undefined
      if (data) {
        applyCollision(data)
        return
      }
      return x0 > nx2 || x1 < nx1 || y0 > ny2 || y1 < ny1
    }
  }

  function prepareCorners(quad: Quad): void {
    if ('data' in quad) {
      quad.bb = boundingBoxes[quad.data.node.index]
      return
    }

    quad.bb = [
      [0, 0],
      [0, 0],
    ]
    for (let i = 0; i < 4; ++i) {
      const child = quad[i] as Quad
      if (child?.bb && child.bb[0][0] < quad.bb[0][0]) {
        quad.bb[0][0] = child.bb[0][0]
      }
      if (child?.bb && child.bb[0][1] < quad.bb[0][1]) {
        quad.bb[0][1] = child.bb[0][1]
      }
      if (child?.bb && child.bb[1][0] > quad.bb[1][0]) {
        quad.bb[1][0] = child.bb[1][0]
      }
      if (child?.bb && child.bb[1][1] > quad.bb[1][1]) {
        quad.bb[1][1] = child.bb[1][1]
      }
    }
  }

  force.initialize = function (newNodes: NodeType[]): void {
    let i: number
    nodes = newNodes
    const n = nodes.length
    boundingBoxes = new Array(n)
    for (i = 0; i < n; ++i) {
      boundingBoxes[i] = bboxAccessor(nodes[i], i, nodes)
    }
  }

  force.iterations = function (value?: number) {
    return value === undefined ? iterations : ((iterations = +value), force)
  }

  force.strength = function (value?: number) {
    return value === undefined ? strength : ((strength = +value), force)
  }

  force.bbox = function (value?: BoundingBox | BoundingBoxAccessor<NodeType>) {
    if (value !== undefined) {
      return ((bbox = typeof value === 'function' ? value : constant(value)), force)
    }
    return bbox
  }

  return force as BBoxForce<NodeType>
}
