import { Axis, CartesianAxis } from '../Axis';
import { Visitor } from './visitor';
export declare class WarningLevels implements Visitor {
    private escalationLevels;
    private group;
    private axis;
    private scale;
    private warningAxis;
    private sections;
    private transitionTime;
    constructor(escalationLevels: any);
    visit(axis: Axis): void;
    create(axis: CartesianAxis): void;
    redraw(): void;
}
