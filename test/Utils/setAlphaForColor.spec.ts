import { setAlphaForColor } from '../../src/Utils/setAlphaForColor';

describe('setAlphaForColor', () => {
  it('should set alpha value for rgba color', () => {
    const color = 'rgba(255, 0, 0, 0.5)';
    const alpha = 0.8;
    const expectedColor = 'rgba(255, 0, 0, 0.8)';
    const result = setAlphaForColor(color, alpha);
    expect(result).toBe(expectedColor);
  });

  it('should add alpha value for hex color with alpha channel', () => {
    const color = '#FF000000';
    const alpha = 0.5;
    const expectedColor = '#FF000080';
    const result = setAlphaForColor(color, alpha);
    expect(result).toBe(expectedColor);
  });

  it('should not modify hex color if it does not have an alpha channel', () => {
    const color = '#FF0000';
    const alpha = 0.5;
    const result = setAlphaForColor(color, alpha);
    expect(result).toBe(color);
  });

  it('should not modify color if it does starts with rgb', () => {
    const color = 'rgb(255, 0, 0)';
    const alpha = 0.5;
    const result = setAlphaForColor(color, alpha);
    expect(result).toBe(color);
  });
});