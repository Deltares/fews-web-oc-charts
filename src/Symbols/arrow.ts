const aspectRatio = 2.5;

export default {
  draw: function (context, size) {
    let y = Math.sqrt(size * aspectRatio);
    let x = y / aspectRatio;
    y = y / 3;
    context.moveTo(0, 0);
    context.lineTo(-x, y);
    context.lineTo(0, -2 * y);
    context.lineTo(x, y);
    context.closePath();
  }
}
