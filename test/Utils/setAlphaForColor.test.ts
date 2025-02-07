import { describe, expect, test } from 'vitest'
import { setAlphaForColor } from '../../src/Utils/setAlphaForColor'

describe('setAlphaForColor', () => {
  test('should set alpha value for rgba color', () => {
    const color = 'rgba(255, 0, 0, 0.5)'
    const alpha = 0.8
    const expectedColor = 'rgba(255, 0, 0, 0.8)'
    const result = setAlphaForColor(color, alpha)
    expect(result).toBe(expectedColor)
  })

  test('should add alpha value for hex color with alpha channel', () => {
    const color = '#FF000000'
    const alpha = 0.5
    const expectedColor = '#FF000080'
    const result = setAlphaForColor(color, alpha)
    expect(result).toBe(expectedColor)
  })

  test('should not modify hex color if test does not have an alpha channel', () => {
    const color = '#FF0000'
    const alpha = 0.5
    const result = setAlphaForColor(color, alpha)
    expect(result).toBe(color)
  })

  test('should not modify color if test does starts with rgb', () => {
    const color = 'rgb(255, 0, 0)'
    const alpha = 0.5
    const result = setAlphaForColor(color, alpha)
    expect(result).toBe(color)
  })
})
