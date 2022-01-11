export function niceDegreeSteps(step) {
    if ( step >= 100 ) {
      return 90
    } else if(step >= 50) {
      return 45
    } else if(step >= 20) {
      return 15
    }
    return step
}
