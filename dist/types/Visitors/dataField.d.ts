import { Axis } from '../Axis';
import { Visitor } from './visitor';
export interface DataFieldOptions {
    selector?: string;
    labelField?: {
        dx?: string | number;
        dy?: string | number;
        text?: string;
    };
    valueField?: {
        dx?: string | number;
        dy?: string | number;
        units?: any;
        precision?: string;
    };
}
export declare class DataField implements Visitor {
    private container;
    private group;
    private options;
    private axis;
    private text;
    private value;
    private formatter;
    private clickCount;
    constructor(container: any, options: DataFieldOptions, formatter?: any);
    visit(axis: Axis): void;
    create(axis: Axis): void;
    redraw(): void;
    onClick(): void;
    valueFormatter(d: any): string;
    getValue(d: any): any;
}
