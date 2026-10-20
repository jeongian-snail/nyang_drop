import { getCatOutlinePoints } from './merge-contact.js?v=2';

// Render the engine's world-space vertices, not an approximate decorative circle.
// The dashed outline is the additional same-level merge contact shape.
export function drawCatHitbox(ctx, body) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#c35427';
  ctx.fillStyle = '#c3542712';
  ctx.setLineDash([]);
  ctx.beginPath();
  body.vertices.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (body.cat.level < 9) {
    ctx.strokeStyle = '#267f92';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    getCatOutlinePoints(body).forEach(([x, y], index) => {
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}
