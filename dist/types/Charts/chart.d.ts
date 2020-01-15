import { Axis, CartesianAxis, PolarAxis } from '../Axis';
export declare const AUTO_SCALE = 1;
export declare abstract class Chart {
    _data: any;
    group: any;
    colorMap: any;
    id: string;
    options: any;
    dataKeys: any;
    _extent: any[];
    constructor(data: any, options: any);
    set data(d: any);
    get data(): any;
    set extent(extent: any[]);
    get extent(): any[];
    addTo(axis: Axis, dataKeys: any, id?: string): this;
    plotter(axis: Axis, dataKeys: any): void;
    protected toolTipFormatterCartesian(d: any): string;
    protected toolTipFormatterPolar(d: any): string;
    abstract plotterCartesian(axis: CartesianAxis, dataKeys: any): any;
    abstract plotterPolar(axis: PolarAxis, dataKeys: any): any;
    protected selectGroup(axis: Axis, cssClass: string): any;
    protected mapDataCartesian(axis: CartesianAxis, dataKeys: any, domain: any): any;
    protected mapDataPolar(axis: PolarAxis, dataKeys: any): any;
}
