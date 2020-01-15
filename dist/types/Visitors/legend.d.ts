import { Axis } from '../Axis';
import { Visitor } from './visitor';
export declare class Legend implements Visitor {
    private container;
    private labels;
    private svg;
    private group;
    private axis;
    constructor(labels: any, container?: HTMLElement);
    visit(axis: Axis): void;
    redraw(): void;
}
