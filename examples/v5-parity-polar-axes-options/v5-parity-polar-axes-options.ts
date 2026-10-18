import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../polar-axes-options/polar-axes-options.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { angularScale, radialScale, axis, line } from '@lib'
import { generateExamplePolarData } from '@shared/data'
import { parityPolarPlot } from '@shared/v5-parity'

const data = generateExamplePolarData([0, 10], [0, 5], 50)
for (const [row, direction] of (['clockwise', 'anticlockwise'] as const).entries()) {
  const ranges =
    row === 0 ? [Math.PI, Math.PI / 2, Math.PI * 1.25] : [Math.PI, Math.PI, Math.PI * 1.25]
  for (const [column, end] of ranges.entries()) {
    const legacyIntercept = [Math.PI / 2, Math.PI / 4, 0][column]
    parityPolarPlot(`chart-container-${row + 1}-${column + 1}`, {
      scales: {
        a: angularScale({
          domain: [0, 10],
          direction,
          range: [0, end],
          intercept: Math.PI / 2 - legacyIntercept,
        }),
        r: radialScale({ domain: [0, 5] }),
      },
      axes: [
        axis('a', { style: 'classic', position: 'angular', tickCount: 8 }),
        axis('r', { style: 'classic', position: 'radial', tickCount: 5 }),
      ],
      marks: [
        line({
          x: 'a',
          y: 'r',
          xValues: data.map((event) => event.angular),
          yValues: data.map((event) => event.radial),
          stroke: 'skyblue',
          strokeWidth: 2,
          strokeLinecap: 'butt',
          strokeLinejoin: 'miter',
          digits: 3,
          vectorEffect: 'none',
        }),
      ],
    })
  }
}
