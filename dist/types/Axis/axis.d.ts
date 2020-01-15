import { Chart } from '../Charts';
import { Visitor } from '../Visitors';
export interface Margin {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface AxisOptions {
    transitionTime?: number;
    x?: any;
    y?: any;
    x2?: any;
    y2?: any;
    margin?: Margin;
}
export declare abstract class Axis {
    tooltip: any;
    type: string;
    view: any;
    defs: any;
    canvas: any;
    svg: any;
    container: HTMLElement;
    width: number;
    height: number;
    margin: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    options: AxisOptions;
    chartGroup: any;
    charts: Chart[];
    initialDraw: boolean;
    visitors: Visitor[];
    timeZone: string;
    constructor(container: HTMLElement, width: number, height: number, options: AxisOptions);
    setSize(height?: number, width?: number): void;
    resize(): void;
    abstract redraw(): void;
    abstract updateGrid(): void;
    removeAllCharts(): void;
    accept(v: Visitor): void;
    createChartGroup(): void;
    createTooltip(): void;
    abstract showTooltip(html: string): void;
    hideTooltip(d: any): void;
    protected abstract setRange(): void;
    protected abstract initGrid(): void;
}
