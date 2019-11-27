export function mergeRecursive(obj1: Object, obj2: Object) {
  for (let p in obj2) {
    try {
      if ( typeof obj2[p] === "object" ) {
        obj1[p] = mergeRecursive(obj1[p], obj2[p]);
      } else {
        obj1[p] = obj2[p];
      }
    } catch(e) {
      obj1[p] = obj2[p];
    }
  }
  return obj1;
}