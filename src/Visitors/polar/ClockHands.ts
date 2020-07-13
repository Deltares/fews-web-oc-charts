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
          minutesHand.attr('d', 'M20.81-81.168l.003-.006c22.517-99.638 20.5-344.75-5.957-467.176 63.927-26.952 58.256-70.477 23.447-134.625-16.899-32.462-27.612-84.239-30.162-128.651-3.303-57.483-13.205-57.483-16.509 0-2.55 44.412-13.264 96.189-30.162 128.651-34.809 64.148-40.479 107.673 23.447 134.625-24.297 114.779-24.288 384.04-5.986 466.801C-57.223-72.521-84.008-39.83-84.008-.88c0 45.921 37.226 83.148 83.147 83.148 45.922 0 83.148-37.227 83.148-83.148.001-38.423-26.065-70.754-61.477-80.288zM-.86 13.729c-8.068 0-14.609-6.54-14.609-14.609 0-8.069 6.541-14.609 14.609-14.609 8.069 0 14.609 6.54 14.609 14.609 0 8.069-6.541 14.609-14.609 14.609z')
          break;
        case ClockHandType.MODERN:
        default:
          minutesHand.attr('d', 'm26.942,149.781l-54.707,0c-10.029,0 -18.235,-6.855 -18.235,-15.22l0,-881.34c0,-8.372 8.206,-15.22 18.235,-15.221l54.707031,0c10.023,0 18.236,6.85 18.236,15.221l0,881.34c0,8.372 -8.205,15.22 -18.236,15.22zm-27.354,-135.876c8.068,0 14.608,-6.541 14.608,-14.609c0,-8.068 -6.54,-14.609 -14.608,-14.609c-8.068,0 -14.609,6.54 -14.609,14.609c0,8.068 6.54,14.609 14.609,14.609zm22.153,-713.715c0,-4.0669 -3.986,-7.395 -8.861,-7.395l-26.583,0c-4.873,0 -8.861,3.328 -8.861,7.395l0,576.923c0,4.067 3.987,7.396 8.861,7.396l26.583,0c4.874,0 8.861,-3.328 8.861,-7.396l0,-576.923z')
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
          hourHands.attr('d', 'M18.348-67.896l.003-.004c11.981-51.574 25.588-124.372-5.078-235.94 54.489-22.973 49.656-60.073 19.985-114.752-14.405-27.67-23.536-71.804-25.71-109.66-2.816-48.998-11.256-48.998-14.072 0-2.174 37.856-11.306 81.99-25.71 109.66-29.671 54.678-34.505 91.78 19.985 114.752-30.627 99.64-22.506 185.811-5.103 235.62C-48.168-60.523-71-32.659-71 .542c0 39.143 31.732 70.875 70.874 70.875 39.142 0 70.874-31.732 70.874-70.875.003-32.75-22.216-60.31-52.4-68.438zM-.123 23.115c-12.467 0-22.573-10.105-22.573-22.573 0-12.466 10.106-22.573 22.573-22.573S22.45-11.924 22.45.542c0 12.468-10.107 22.573-22.573 22.573z')
          break;
        case ClockHandType.MODERN:
        default:
          hourHands.attr('d', 'm26.943,116.508l-54.7,0c-10.029,0 -18.235,-4.857 -18.235,-10.793l0,-624.923c0,-5.936 8.206,-10.792 18.235,-10.792l54.7,0c10.029,0 18.236,4.857 18.236,10.792l0,624.923c0,5.936 -8.206,10.793 -18.236,10.793zm-5.201,-602.413c0,-2.884 -3.987,-5.244 -8.861,-5.244l-26.583,0c-4.874,0 -8.861,2.36 -8.861,5.244l0,409.073c0,2.884 3.987,5.245 8.861,5.245l26.583,0c4.873,0 8.861,-2.36 8.861,-5.245l0,-409.073zm-22.156,463.519c-12.467,0 -22.573,10.106 -22.573,22.573c0,12.467 10.106,22.574 22.573,22.574c12.467,0 22.574,-10.106 22.574,-22.574c-0.001,-12.467 -10.107,-22.573 -22.574,-22.573z')
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


