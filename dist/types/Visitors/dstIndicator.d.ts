import { Axis, CartesianAxis } from '../Axis';
import { Visitor } from './visitor';
export declare class DstIndicator implements Visitor {
    private group;
    private indicator;
    private axis;
    private dstDate;
    constructor();
    visit(axis: Axis): void;
    create(axis: CartesianAxis): void;
    redraw(): void;
    findDst(startMoment: any, endMoment: any): Date;
}
