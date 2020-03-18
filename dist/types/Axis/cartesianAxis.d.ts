import { Axis, AxisOptions } from './axis';
interface XAxisOptions {
    label?: string;
    time?: boolean;
    unit?: string;
    domain?: [number, number];
}
interface YAxisOptions {
    label?: string;
    unit?: string;
    domain?: [number, number];
}
export interface CartesianAxisOptions extends AxisOptions {
    x?: XAxisOptions;
    x2?: XAxisOptions;
    y?: YAxisOptions;
    y2?: YAxisOptions;
}
export declare class CartesianAxis extends Axis {
    canvas: any;
    container: HTMLElement;
    xScale: any;
    yScale: any;
    clipPathId: string;
    timeZoneOffset: number;
    constructor(container: HTMLElement, width: number | null, height: number | null, options?: CartesianAxisOptions);
    setCanvas(): void;
    setClipPath(): void;
    zoom(): void;
    redraw(options?: any): void;
    resize(): void;
    updateGrid(): void;
    showTooltip(html: string): void;
    protected setRange(): void;
    protected initGrid(): void;
    generateMultiFormat(): (date: any) => string;
}
export {};
