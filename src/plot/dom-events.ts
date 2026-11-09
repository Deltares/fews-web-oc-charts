import type { DomainChangeDetail, LayoutChangeDetail, LegendChangeDetail } from './create-plot.js'
import type { BrushSelection } from './plugins/brush/brush.js'
import type { LegendToggleEventDetail } from './plugins/legend/legend.js'

export interface PlotDomEventMap {
  domainchange: CustomEvent<DomainChangeDetail>
  layoutchange: CustomEvent<LayoutChangeDetail>
  legendchange: CustomEvent<LegendChangeDetail>
  legendtoggle: CustomEvent<LegendToggleEventDetail>
  brush: CustomEvent<BrushSelection>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface HTMLElementEventMap extends PlotDomEventMap {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface SVGElementEventMap extends HTMLElementEventMap {}
}
