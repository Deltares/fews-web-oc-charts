export interface Header {
    startTime: Date;
    endTime: Date;
    recordCount: number;
    columns: HeaderColumns;
}
export interface HeaderColumns {
    [key: string]: HeaderColumn;
}
export interface HeaderColumn {
    id: string;
    name: string;
    dataType: string;
    renderType: string;
    format?: string;
    aggregate?: string;
}
export interface Datum {
    ts: Date;
    f: FieldColumns;
}
export interface FieldColumns {
    [key: string]: FieldColumn;
}
export interface FieldColumn {
    v: number | number[];
}
export declare class TimeSeries {
    docType: string;
    version: string;
    header: Header;
    data: Datum[];
}
