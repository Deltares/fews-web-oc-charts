import * as d3 from 'd3'
import {Visitor} from '../visitor'
import { Axis, PolarAxis } from '../../Axis'
import merge from 'lodash/merge'
import defaultsDeep from 'lodash/defaultsDeep'


export enum ClockHandType {
  CLASSIC = 'classic',
  MODERN = 'modern'
}

export interface ClockHandsOptions {
  hoursHand: string;
  minutesHand: string;
  secondsHand: string;
}

export class ClockHands implements Visitor {
  private _options: ClockHandsOptions
  private _axis: PolarAxis
  private _timer: d3.Timer
  private _group: any
  static readonly REFRESH_INTERVAL: number = 10000

  constructor(options: ClockHandsOptions) {
    this._options = defaultsDeep({}, options, { hoursHand: ClockHandType.MODERN, minutesHand: ClockHandType.MODERN})
  }

  setOptions (options: ClockHandsOptions) {
    merge(this._options, options)
  }

  visit(axis: Axis) {
    console.log('clockHands')
    this._axis = axis as PolarAxis
    this.create(this._axis)
    this.redraw()
    this._timer = d3.interval((elapsed: number) => {
      this.redraw(1000)
    }, ClockHands.REFRESH_INTERVAL)
  }

  create(axis: PolarAxis) {
    let filter = this._axis.svg.select('defs')
      .append('filter')
        .attr('id','clockHandsFilter')
        .attr('width','200%')
        .attr('height', '200%')

    filter.append('feOffset')
      .attr('result','offOut')
      .attr('in', 'SourceAlpha')
      .attr('dx', 0)
      .attr('dy', 0)

    filter.append('feGaussianBlur')
      .attr('result', 'blurOut')
      .attr('in', 'offOut')
      .attr('stdDeviation', 10)

    filter.append('feBlend')
      .attr('result', 'blurOut')
      .attr('in', 'SourceGraphic')
      .attr('in2', 'blurOut')
      .attr('mode', 'normal')

    if (!this._group) {
      this._group = axis.canvas.append('g').attr('class', 'clock-hands').attr('transform', 'scale(.25)')
      const minutesHand = this._group.append('g')
        .attr('class', 'minutesHand')
        .append('g')
        .attr('filter','url(#clockHandsFilter)')
        .append('path')
        .attr('fill', 'white')
        .attr('opacity',0.4)
        .attr('stroke', 'none')
        // .attr('stroke-width', '8')
      switch (this._options.minutesHand) {
        case ClockHandType.CLASSIC:
          minutesHand.attr('d', 'm20.809998,-81.16803l0.002991,-0.005981c22.517029,-99.638 20.5,-344.75 -5.95697,-467.175964c63.927002,-26.952026 58.255981,-70.47699 23.44696,-134.625061c-16.898987,-32.461975 -27.612,-84.238953 -30.161987,-128.65094c-3.302979,-57.483032 -13.205017,-57.483032 -16.508972,0c-2.550049,44.411987 -13.264008,96.188965 -30.162018,128.65094c-34.80899,64.148071 -40.479004,107.673035 23.446991,134.625061c-24.296997,114.778961 -24.287994,384.039978 -5.985992,466.800964c-36.153992,9.028015 -62.938995,41.718994 -62.938995,80.669006c0,45.92102 37.225983,83.14801 83.146973,83.14801c45.921997,0 83.14801,-37.22699 83.14801,-83.14801c0.001038,-38.422974 -26.065002,-70.753967 -61.47699,-80.288025zm-21.669983,94.897034c-8.067993,0 -14.609009,-6.539978 -14.609009,-14.609009c0,-8.06897 6.541016,-14.609009 14.609009,-14.609009c8.06897,0 14.609009,6.540039 14.609009,14.609009c0,8.069031 -6.541016,14.609009 -14.609009,14.609009z')
          break;
        case ClockHandType.MODERN:
        default:
          minutesHand.attr('d', 'm26.942017,149.780762l-54.707031,0c-10.028992,0 -18.234985,-6.849121 -18.234985,-15.219971l0,-881.340088c0,-8.371826 8.205994,-15.220947 18.234985,-15.220947l54.707031,0c10.029968,0 18.235962,6.850098 18.235962,15.220947l0,881.340088c0,8.37207 -8.204956,15.219971 -18.235962,15.219971zm-27.354004,-135.875977c8.067993,0 14.607971,-6.541016 14.607971,-14.609131c0,-8.067871 -6.539978,-14.608887 -14.607971,-14.608887c-8.067993,0 -14.609009,6.540039 -14.609009,14.608887c0,8.068115 6.539978,14.609131 14.609009,14.609131zm22.153015,-713.715088c0,-4.066895 -3.986023,-7.39502 -8.861023,-7.39502l-26.583008,0c-4.872986,0 -8.861023,3.328125 -8.861023,7.39502l0,576.923096c0,4.066895 3.987,7.395996 8.861023,7.395996l26.583008,0c4.874023,0 8.861023,-3.328125 8.861023,-7.395996l0,-576.923096z')
          break;
      }


      const hourHands = this._group.append('g')
      .attr('class','hoursHand')
      .append('g')
      .attr('filter', 'url(#clockHandsFilter)')
      .append('path')
      .attr('fill','white')
      .attr('stroke', 'none')
      // .attr('fill-rule','nonzero')

      switch (this._options.hoursHand) {
        case ClockHandType.CLASSIC:
          hourHands.attr('d', 'm18.348,-67.895508l0.002998,-0.003998c11.981003,-51.574005 25.588005,-124.372009 -5.077995,-235.940002c54.488991,-22.972992 49.655998,-60.072998 19.985001,-114.752014c-14.405006,-27.669983 -23.536003,-71.803986 -25.710007,-109.660004c-2.815994,-48.997986 -11.255997,-48.997986 -14.071999,0c-2.174004,37.856018 -11.306,81.990021 -25.709999,109.660004c-29.670998,54.678009 -34.504997,91.779022 19.985001,114.752014c-30.626999,99.640015 -22.506001,185.811005 -5.103001,235.619995c-30.815998,7.696014 -53.647999,35.561005 -53.647999,68.761993c0,39.142029 31.731998,70.874023 70.874001,70.874023c39.141998,0 70.874001,-31.731995 70.874001,-70.874023c0.003006,-32.750977 -22.216003,-60.309967 -52.400002,-68.437988zm-18.471001,91.010986c-12.466995,0 -22.572998,-10.105957 -22.572998,-22.572998c0,-12.466003 10.106003,-22.572998 22.572998,-22.572998c12.467003,0 22.572998,10.106995 22.572998,22.572998c0,12.467041 -10.106995,22.572998 -22.572998,22.572998z')
          break;
        case ClockHandType.MODERN:
        default:
          hourHands.attr('d', 'm26.943001,116.507996l-54.708,0c-10.028999,0 -18.235001,-4.856995 -18.235001,-10.79303l0,-624.922974c0,-5.935974 8.206001,-10.791992 18.235001,-10.791992l54.708,0c10.028999,0 18.236,4.856995 18.236,10.791992l0,624.922974c0,5.936035 -8.206001,10.79303 -18.236,10.79303zm-5.201004,-602.413025c0,-2.883972 -3.987,-5.243958 -8.860996,-5.243958l-26.583,0c-4.874001,0 -8.861,2.359985 -8.861,5.243958l0,409.073029c0,2.884003 3.987,5.244995 8.861,5.244995l26.583,0c4.872997,0 8.860996,-2.359985 8.860996,-5.244995l0,-409.073029zm-22.155998,463.519043c-12.466999,0 -22.572998,10.105957 -22.572998,22.572998c0,12.46698 10.105999,22.573974 22.572998,22.573974c12.467003,0 22.574005,-10.105957 22.574005,-22.573974c-0.001007,-12.467041 -10.107002,-22.572998 -22.574005,-22.572998z')
          break;
      }
    }

  }
  redraw (transition: number = 0) {
    const now = new Date()
    console.log(now.getHours())
    const hoursAngle = now.getHours() * 30 + now.getMinutes() / 2
    const minutesAngle = now.getMinutes()*6

    console.log(hoursAngle.toFixed(0))
    this._group.select('.hoursHand')
      .attr('transform', `rotate(${hoursAngle.toFixed(0)})`)
    this._group.select('.minutesHand')
      .transition()
      .duration(transition)
      .attr('transform', `rotate(${minutesAngle.toFixed(0)})`)
  }
}


