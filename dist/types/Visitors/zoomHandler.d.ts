import { Axis, CartesianAxis } from '../Axis';
import { Visitor } from './visitor';
export declare class ZoomHandler implements Visitor {
    private brushStartPoint;
    private svg;
    private brushGroup;
    private mouseGroup;
    private axis;
    private mode;
    private readonly MINMOVE;
    private lastPoint;
    constructor();
    visit(axis: Axis): void;
    createHandler(axis: CartesianAxis): void;
    initSelection(point: [number, number]): void;
    updateSelection(point: [number, number]): void;
    endSelection(point: [number, number]): void;
    resetZoom(point: [number, number]): void;
    redraw(): void;
}
