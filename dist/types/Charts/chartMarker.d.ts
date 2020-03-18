import { CartesianAxis, PolarAxis } from '../Axis';
import { Chart } from './chart';
export declare class ChartMarker extends Chart {
    private previousData;
    plotterCartesian(axis: CartesianAxis, dataKeys: any): void;
    plotterPolar(axis: PolarAxis, dataKeys: any): void;
}
