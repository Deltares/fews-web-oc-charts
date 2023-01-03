import { CartesianAxis, CartesianAxesOptions } from '../src/Axis/cartesianAxis.js'
import { AxisPosition } from '../src/Types/axisPosition.js'
import { AxisType } from '../src/Axis/axis.js'

const containerReference = document.getElementById['chart-container'] as HTMLElement

const options: CartesianAxesOptions = {
  x : [ {type: AxisType.time, position: AxisPosition.Left } ],
  y : [ {label: 'Waterstand [cm]', position: AxisPosition.Bottom} ],
  margin: {left: 50, right: 50 }
}

const axis = new CartesianAxis(containerReference, null, null, options)





