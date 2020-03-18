import { CartesianAxis, PolarAxis } from '../Axis';
import { Chart } from './chart';
export declare class ChartHistogram extends Chart {
    plotterCartesian(axis: CartesianAxis, dataKeys: any): void;
    plotterPolar(axis: PolarAxis, dataKeys: any): void;
}
