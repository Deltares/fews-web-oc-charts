import { Axis, CartesianAxis } from '../Axis';
import { Visitor } from './visitor';
export declare class CurrentTime implements Visitor {
    private timer;
    private group;
    private line;
    private indicator;
    private axis;
    private transition;
    private datetime;
    static readonly REFRESH_INTERVAL: number;
    constructor();
    setDateTime(dt: Date): void;
    visit(axis: Axis): void;
    create(axis: CartesianAxis): void;
    redraw(): void;
}
