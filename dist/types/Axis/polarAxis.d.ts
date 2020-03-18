import { Axis, AxisOptions } from './axis';
export declare const CLOCKWISE = -1;
export declare const ANTICLOCKWISE = 1;
interface RadialAxisOptions {
    label?: string;
    scale?: number | number[];
}
interface AngularAxisOptions {
    label?: string;
    direction?: number;
    intercept?: number;
    range?: number[];
}
export interface PolarAxisOptions extends AxisOptions {
    innerRadius?: number;
    radial?: RadialAxisOptions;
    angular?: AngularAxisOptions;
}
export declare class PolarAxis extends Axis {
    radialScale: any;
    angularScale: any;
    outerRadius: number;
    innerRadius: number;
    intercept: number;
    direction: number;
    private angularRange;
    constructor(container: HTMLElement, width: number, height: number, options?: PolarAxisOptions);
    redraw(): void;
    radToDegrees(value: number): number;
    updateGrid(): void;
    showTooltip(html: string): void;
    protected setRange(): void;
    protected initGrid(): void;
}
export {};
