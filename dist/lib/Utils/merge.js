"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function mergeRecursive(obj1, obj2) {
    for (var p in obj2) {
        try {
            if (typeof obj2[p] === "object") {
                obj1[p] = mergeRecursive(obj1[p], obj2[p]);
            }
            else {
                obj1[p] = obj2[p];
            }
        }
        catch (e) {
            obj1[p] = obj2[p];
        }
    }
    return obj1;
}
exports.mergeRecursive = mergeRecursive;
//# sourceMappingURL=merge.js.map