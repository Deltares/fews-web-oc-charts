import { quadtree } from 'd3-quadtree'

function constant(_) {
  return function () {
    return _
  }
}

export function rectCollide() {
  let size = constant([0, 0])
  let nodes, sizes, masses
  let strength = 1
  let iterations = 1
  let nodeCenterX
  let nodeMass
  let nodeCenterY

  function force() {
    let node
    let i = -1
    while (++i < iterations) {
      iterate()
    }

    function iterate() {
      const tree = quadtree(nodes, xCenter, yCenter)
      let j = -1

      while (++j < nodes.length) {
        node = nodes[j]
        nodeMass = masses[j]
        nodeCenterX = xCenter(node)
        nodeCenterY = yCenter(node)
        tree.visit(collisionDetection)
      } //end nodes loop
    } //end iterate function
    function collisionDetection(quad, x0, y0, x1, y1) {
      let updated = false
      const data = quad.data
      if (data) {
        if (data.index > node.index) {
          const xSize = (node.width + data.width) / 2
          const ySize = (node.height + data.height) / 2
          const dataCenterX = xCenter(data)
          const dataCenterY = yCenter(data)
          const dx = nodeCenterX - dataCenterX
          const dy = nodeCenterY - dataCenterY
          const absX = Math.abs(dx)
          const absY = Math.abs(dy)
          const xDiff = absX - xSize
          const yDiff = absY - ySize
          if (xDiff < 0 && yDiff < 0) {
            //collision has occurred
            //overlap x
            let sx = xSize - absX
            //overlap y
            let sy = ySize - absY

            if (sx < sy) {
              //x displacement smaller than y
              if (sx > 0) {
                sy = 0
              }
            } else {
              //y displacement smaller than x
              if (sy > 0) {
                sx = 0
              }
            }
            if (dx < 0) {
              //change sign of sx - has collided on the right(?)
              sx = -sx
            }
            if (dy < 0) {
              //change sign of sy -
              sy = -sy
            }
            //magnitude of vector
            const distance = Math.sqrt(sx * sx + sy * sy)
            //direction vector/unit vector - normalize each component by the magnitude to get the direction
            const vCollisionNorm = {
              x: sx / distance,
              y: sy / distance,
            }
            const vRelativeVelocity = {
              x: data.vx - node.vx,
              y: data.vy - node.vy,
            }
            //dot product of relative velocity and collision normal
            const speed =
              vRelativeVelocity.x * vCollisionNorm.x + vRelativeVelocity.y * vCollisionNorm.y
            if (speed < 0) {
              //negative speed = rectangles moving away
            } else {
              //takes into account mass
              const collisionImpulse = (2 * speed) / (masses[data.index] + masses[node.index])
              if (Math.abs(xDiff) < Math.abs(yDiff)) {
                //x overlap is less
                data.vx -= collisionImpulse * masses[node.index] * vCollisionNorm.x
                node.vx += collisionImpulse * masses[data.index] * vCollisionNorm.x
              } else {
                //y overlap is less
                data.vy -= collisionImpulse * masses[node.index] * vCollisionNorm.y
                node.vy += collisionImpulse * masses[data.index] * vCollisionNorm.y
              }
              updated = true
            }
          }
        }
      }
      return updated
    }
  } //end force

  function xCenter(d) {
    return d.x + d.vx + sizes[d.index][0] / 2
  }

  function yCenter(d) {
    return d.y + d.vy + sizes[d.index][1] / 2
  }

  force.initialize = function (_) {
    sizes = (nodes = _).map((d) => [d.width, d.height])
    masses = sizes.map((d) => d[0] * d[1])
  }

  force.size = function (_) {
    return arguments.length ? ((size = typeof _ === 'function' ? _ : constant(_)), force) : size
  }

  force.strength = function (_) {
    return arguments.length ? ((strength = +_), force) : strength
  }

  force.iterations = function (_) {
    return arguments.length ? ((iterations = +_), force) : iterations
  }

  return force
}
