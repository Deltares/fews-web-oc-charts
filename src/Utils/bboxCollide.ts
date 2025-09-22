import { quadtree } from 'd3-quadtree'

export function bboxCollide(bbox) {
  function x(d): number {
    return d.x + d.vx
  }

  function y(d): number {
    return d.y + d.vy
  }

  function constant(c) {
    return function () {
      return c
    }
  }

  function bbLength(bb: number[][], heightWidth: number): number {
    return bb[1][heightWidth] - bb[0][heightWidth]
  }

  let nodes,
    boundingBoxes,
    strength = 0.05,
    iterations = 1

  if (typeof bbox !== 'function') {
    bbox = constant(
      bbox === null
        ? [
            [0, 0],
            [1, 1],
          ]
        : bbox,
    )
  }

  function constructCornerNodes() {
    const cornerNodes = []
    nodes.forEach(function (d, j) {
      cornerNodes.push({
        node: d,
        vx: d.vx,
        vy: d.vy,
        x: d.x + (boundingBoxes[j][1][0] + boundingBoxes[j][0][0]) / 2,
        y: d.y + (boundingBoxes[j][0][1] + boundingBoxes[j][1][1]) / 2,
      })
      cornerNodes.push({
        node: d,
        vx: d.vx,
        vy: d.vy,
        x: d.x + boundingBoxes[j][0][0],
        y: d.y + boundingBoxes[j][0][1],
      })
      cornerNodes.push({
        node: d,
        vx: d.vx,
        vy: d.vy,
        x: d.x + boundingBoxes[j][0][0],
        y: d.y + boundingBoxes[j][1][1],
      })
      cornerNodes.push({
        node: d,
        vx: d.vx,
        vy: d.vy,
        x: d.x + boundingBoxes[j][1][0],
        y: d.y + boundingBoxes[j][0][1],
      })
      cornerNodes.push({
        node: d,
        vx: d.vx,
        vy: d.vy,
        x: d.x + boundingBoxes[j][1][0],
        y: d.y + boundingBoxes[j][1][1],
      })
    })
    return cornerNodes
  }

  function force() {
    let i, tree, node, xi, yi, bbi, nx1, ny1, nx2, ny2

    const cornerNodes = constructCornerNodes()
    const cn = cornerNodes.length

    let nodeI
    for (let k = 0; k < iterations; ++k) {
      tree = quadtree(cornerNodes, x, y).visitAfter(prepareCorners)

      for (i = 0; i < cn; ++i) {
        nodeI = ~~(i / 5)
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

    function apply(quad, x0, y0, x1, y1) {
      const data = quad.data
      if (data) {
        const bWidth = bbLength(bbi, 0),
          bHeight = bbLength(bbi, 1)

        if (data.node.index !== nodeI) {
          const dataNode = data.node
          const bbj = boundingBoxes[dataNode.index]
          const dnx1 = dataNode.x + dataNode.vx + bbj[0][0]
          const dny1 = dataNode.y + dataNode.vy + bbj[0][1]
          const dnx2 = dataNode.x + dataNode.vx + bbj[1][0]
          const dny2 = dataNode.y + dataNode.vy + bbj[1][1]
          const dWidth = bbLength(bbj, 0)
          const dHeight = bbLength(bbj, 1)

          if (nx1 <= dnx2 && dnx1 <= nx2 && ny1 <= dny2 && dny1 <= ny2) {
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
        }
        return
      }

      return x0 > nx2 || x1 < nx1 || y0 > ny2 || y1 < ny1
    }
  }

  function prepareCorners(quad) {
    if (quad.data) {
      quad.bb = boundingBoxes[quad.data.node.index]
      return quad.bb
    }

    quad.bb = [
      [0, 0],
      [0, 0],
    ]
    for (let i = 0; i < 4; ++i) {
      if (quad[i] && quad[i].bb[0][0] < quad.bb[0][0]) {
        quad.bb[0][0] = quad[i].bb[0][0]
      }
      if (quad[i] && quad[i].bb[0][1] < quad.bb[0][1]) {
        quad.bb[0][1] = quad[i].bb[0][1]
      }
      if (quad[i] && quad[i].bb[1][0] > quad.bb[1][0]) {
        quad.bb[1][0] = quad[i].bb[1][0]
      }
      if (quad[i] && quad[i].bb[1][1] > quad.bb[1][1]) {
        quad.bb[1][1] = quad[i].bb[1][1]
      }
    }
  }

  force.initialize = function (_) {
    let i
    nodes = _
    const n = nodes.length
    boundingBoxes = new Array(n)
    for (i = 0; i < n; ++i) boundingBoxes[i] = bbox(nodes[i], i, nodes)
  }

  force.iterations = function (_) {
    return arguments.length ? ((iterations = +_), force) : iterations
  }

  force.strength = function (_) {
    return arguments.length ? ((strength = +_), force) : strength
  }

  force.bbox = function (_) {
    if (arguments.length) {
      return ((bbox = typeof _ === 'function' ? _ : constant(+_)), force)
    }
    return bbox
  }

  return force
}
