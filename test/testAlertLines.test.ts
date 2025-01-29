import { describe, expect, test } from 'vitest'
import {AlertLines} from '../src/Visitors/alertLines'

describe('test for AlertLines', () => {
    test('should create an alert line', () => {
        const alertLines = new AlertLines([{x1: 0, x2: 1, value: 0, color: 'red', yAxisIndex: 0, description: 'Test alert line'}])
        expect(alertLines.options.length).toBe(1)
    })
    test('should not create an alert line', () => {
        const alertLines = new AlertLines([])
        expect(alertLines.options.length).toBe(0)  
    })
})
