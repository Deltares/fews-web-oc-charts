// unit tests for the testAlertLines.ts file
import {AlertLines} from '../src/Visitors/alertLines'

describe('test for AlertLines', () => {
    it('should create an alert line', () => {
        const alertLines = new AlertLines([{x1: 0, x2: 1, value: 0, color: 'red', yAxisIndex: 0, description: 'Test alert line'}])
        expect(alertLines.options.length).toBe(1)
    })
    it('should not create an alert line', () => {
        const alertLines = new AlertLines([])
        expect(alertLines.options.length).toBe(0)  
    })
})
