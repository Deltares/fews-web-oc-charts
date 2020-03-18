import { Axis, CartesianAxis } from '../Axis';
import { Visitor } from './visitor';
export declare class MouseOver implements Visitor {
    private trace;
    private group;
    private axis;
    constructor(trace: string[]);
    visit(axis: Axis): void;
    create(axis: CartesianAxis): void;
    redraw(): void;
}
