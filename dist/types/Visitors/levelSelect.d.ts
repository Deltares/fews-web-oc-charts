import { Axis, CartesianAxis } from '../Axis';
import { Visitor } from './visitor';
export declare class LevelSelect implements Visitor {
    group: any;
    line: any;
    axis: CartesianAxis;
    value: number;
    callback: Function;
    format: any;
    constructor(value: number, callback: Function);
    visit(axis: Axis): void;
    create(axis: CartesianAxis): void;
    redraw(): void;
    start(event: any): void;
    drag(event: any): void;
    end(event: any): void;
}
