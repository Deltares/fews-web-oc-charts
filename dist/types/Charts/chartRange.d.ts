import { CartesianAxis, PolarAxis } from '../Axis';
import { Chart } from './chart';
export declare class ChartRange extends Chart {
    private previousData;
    set extent(extent: any[]);
    get extent(): any[];
    toolTipFormatterCartesian(d: any): string;
    toolTipFormatterPolar(d: any): string;
    plotterCartesian(axis: CartesianAxis, dataKeys: any): void;
    plotterPolar(axis: PolarAxis, dataKeys: any): void;
}
