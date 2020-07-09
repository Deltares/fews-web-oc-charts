import { CartesianAxis, CartesianAxesOptions, AxisType, AxisPosition } from '../src/Axis'

const containerReference = document.getElementById['chart-container'] as HTMLElement

const options: CartesianAxesOptions = {
  x : [ {type: AxisType.time, position:  } ],
  y : [ {label: 'Waterstand [cm]', position: AxisPosition.Bottom} ],
  margin: {left: 50, right: 50 }
}

const axis = new CartesianAxis(containerReference, null, null, options)





