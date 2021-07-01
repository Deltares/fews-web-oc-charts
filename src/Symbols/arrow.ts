const hob = 2;

export default {
  draw: function (context, size) {
    let y = Math.sqrt(size * hob) / 3
    let x = y / hob
    context.moveTo(0, 0)
    context.lineTo(-x, y)
    context.lineTo(0, -2 * y)
    context.lineTo(x, y)
    context.closePath()
  }
}
